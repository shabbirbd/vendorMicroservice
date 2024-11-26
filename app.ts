require('dotenv').config();
import cors from 'cors';
import express, { Request, Response } from 'express';
import fetch from 'node-fetch';
import OpenAI from 'openai';
import axios from 'axios';
import os from 'os';
import path from 'path';
import fs from 'fs';

const app = express();
const port = 8000;
app.use(express.json({ limit: '100mb' }));
app.use(cors())

const openAI = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const downloadFileFromUrl = async (url: string): Promise<string> => {
  try {
    // Fetch the file from the URL
    const response = await axios({
      method: 'get',
      url: url,
      responseType: 'stream'
    });

    // Create a temporary file
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, `openai-upload-${Date.now()}.jsonl`);

    // Create a write stream
    const writer = fs.createWriteStream(tempFilePath);

    // Pipe the response data to the file
    response.data.pipe(writer);

    // Return a promise that resolves when the file is fully written
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    return tempFilePath;
  } catch (error) {
    console.error('Error downloading file:', error);
    throw error;
  }
};

const getFileId = async (model : any) => {
  let fileId;
  if(model.fileType === 'upload') {
    console.log('i am here....')
    const filePath = await downloadFileFromUrl(model.trainingFile);

    const fileResponse = await openAI.files.create({
      file: fs.createReadStream(filePath),
      purpose: 'fine-tune'
    });
    console.log(fileResponse.id, 'fileId.....')
    fileId = fileResponse.id;
    await fs.promises.unlink(filePath);
  } else {
    fileId = model.fileId;
  }
  return fileId
};

const getValidationFileId = async (model : any) => {
  let fileId;
  if(model.validationFileType === 'upload') {
    if(model?.validationFile?.length > 0) {
      const filePath = await downloadFileFromUrl(model.validationFile);

      const fileResponse = await openAI.files.create({
        file: fs.createReadStream(filePath),
        purpose: 'fine-tune'
      });
      fileId = fileResponse.id;
      await fs.promises.unlink(filePath);
    } else {
      fileId = '';
    }
  } else if(model.validationFileType === 'existing') {
    fileId = model.fileId;
  } else {
    fileId = '';
  }
  return fileId
};

const formatHyperParemeters = async (model: any) => {
  let parameters: any = {};
  if(model.batchSize?.length > 0) {
    const batchSize = parseInt(model.batchSize);
    if(batchSize > 0) {
      parameters.batch_size = batchSize
    } else {
      parameters.batch_size = 'auto'
    }
  } else {
    parameters.batch_size = 'auto'
  }
  if(model.learningRate?.length > 0) {
    parameters.learning_rate_multiplier = parseInt(model.learningRate)
  } else {
    parameters.learning_rate_multiplier = 'auto'
  }
  if(model.epoches?.length > 0) {
    parameters.n_epochs = parseInt(model.epoches);
  } else {
    parameters.n_epochs = 'auto'
  }
  return parameters
};



const initiateFinetuning = async (config: any) => {
  console.log("Initiating fine tuning...")
  try {
    // Create a fine-tuning job with the uploaded file
    console.log("Starting fine tuning job in openai...")
    const job = await openAI.fineTuning.jobs.create(config);

    console.log("Fine tuning job started successfully...")
    return job.id;
  } catch (error: any) {
    console.error('Error initiating fine-tuning:', error.message);
    throw error;
  }
};

const checkStatusAndGetBaseModel = async (jobId: string) => {
  console.log("Start creating model....")
  while (true) {
    try {
      console.log("Getting job details....")
      const jobDetails = await openAI.fineTuning.jobs.retrieve(jobId);
      const jobStatus = jobDetails.status;

      if (jobStatus === 'succeeded') {
        console.log("Getting model name....")
        const modelName = jobDetails.fine_tuned_model;
        console.log('Model Created:', modelName);
        return modelName;
      } else if (jobStatus === 'failed' || jobStatus === 'cancelled') {
        console.log(`Job ${jobStatus}, unable to create model.`);
        return null;
      } else {
        console.log(`Job still in progress: ${jobStatus}. Checking again in 60 seconds.`);
        await new Promise(resolve => setTimeout(resolve, 60000)); // Sleep for 60 seconds
      }
    } catch (error) {
      console.error('Error retrieving job details:', error);
      throw error; // or handle the error as needed
    }
  }
};


const updatemodel = async (modelId: string, modelForUpdate: {}) => {
  console.log("Updating model....")
  try {
    console.log("updating...", modelId)
    const newModel = { ...modelForUpdate }
    const response = await fetch(`https://vendor.com/api/fineTune/openai`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ modelId: modelId, newModel: newModel })
    });
    const updatedmodel = await response.json();
    console.log(response.status, "response after updating attempt")
    return updatedmodel
  } catch (error: any) {
    console.log("Error while updating the model", error.message)
    throw error
  }
};

const getModelById = async (modelId: string) => {
  console.log("Getting model....")
  try {
    console.log("Getting...", modelId)
    const response = await fetch(`https://vendor.com/api/fineTune/openai/getModelById/${modelId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json"
      }
    });
    const model = await response.json();
    return model
  } catch (error: any) {
    console.log("Error while updating the model", error.message)
    throw error
  }
}


app.post('/createModel', async (req: Request, res: Response) => {
  const { currentModel } = await req.body;

  try {
    console.log('starting the process......')
    const fileId = await getFileId(currentModel);
    console.log(fileId, 'file id....')
    let config : any = {
      training_file: fileId,
      model: currentModel.baseModel
    };
    const validationFileId = await getValidationFileId(currentModel);
    if(validationFileId?.length > 0) {
      config.validation_file = validationFileId
    };
    if(currentModel?.suffix?.length > 0) {
      config.suffix = currentModel.suffix;
    };
    if(currentModel?.seed?.length > 0) {
      config.seed = parseInt(currentModel.seed);
    };
    const hyperParameters = await formatHyperParemeters(currentModel);
    config.hyperparameters = hyperParameters;

    const fineTuningId = await initiateFinetuning(config);
    const createdModel = await checkStatusAndGetBaseModel(fineTuningId);
    console.log("created model.....", createdModel);

    // const getmodel = await getModelById(currentModel._id);

    if (createdModel) {
      const newModel = {
        ...currentModel,
        createdModel: createdModel,
        status: 'active'
      };
      const updateLog = await updatemodel(currentModel._id, newModel);
      console.log("model updated successfully with model name...", updateLog);
    } else {
      console.log('Model name not returned from the service');
    }

    return res.status(200).json({ model_name: createdModel });
  } catch (error) {
    console.error('Error during model creation:', error);
    return res.status(500).json(error);
  }
});


app.listen(port, '0.0.0.0', () => {
  console.log(`Model creation running on ${port}`);
});




// /usr/local/bin/yt-dlp https://www.youtube.com/watch?v=msIZQwKy6lc --extract-audio --audio-format mp3 --output /app/668ed5d19ea2a61422caa197output.mp3 --no-check-certificates --no-warnings --prefer-free-formats --add-header "referer:youtube.com" --add-header "user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36" --ffmpeg-location /usr/bin/ffmpeg

// /usr/local/bin/yt-dlp https://www.youtube.com/watch?v=msIZQwKy6lc --extract-audio --audio-format mp3 --output /tmp/668ed5d19ea2a61422caa197output.mp3 --no-check-certificates --no-warnings --prefer-free-formats --add-header "referer:youtube.com" --add-header "user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36" --ffmpeg-location /usr/bin/ffmpeg
