require('dotenv').config();
// import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import cors from 'cors';
import express, { Request, Response } from 'express';
import fs from 'fs';
import OpenAI from 'openai';
import { ChatCompletionRequestMessageRoleEnum } from 'openai-edge';
import { YoutubeTranscript } from 'youtube-transcript';


type ChatCompletionRequestMessageRole = "system" | "user" | "assistant";
// constants
const prompt = "Create a model that embodies the persona of a YouTube influencer, learning from video transcripts to mirror their speaking style, tone, and content preferences."
const temperature = .35
interface Example {
    prompt: string;
    response: string;
}
interface ChatMessage {
    role: ChatCompletionRequestMessageRole;
    content: string;
}



const app = express();
const port = 8000;
app.use(express.json()); 
app.use(cors())


const openAI =  new  OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});





function shuffleArray(array: any[]) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

const getTranscript = async (videoId: string)=>{
    const fullTexts = await YoutubeTranscript.fetchTranscript(videoId);
    console.log("Got the transcript...")
    return fullTexts
}




const generateData = async (prompt: string, full_text:string, prevExamples:Example[], temperature=0.5, index: number): Promise<string | null>=>{
    console.log(`Generating data.....${index}`)
    const detailedInstruction = `You are helping to train a model that impersonates a specific YouTube influencer. Using the provided video transcript, generate prompts and responses that capture the influencer's unique style, tone, and approach to topics. Ensure each prompt/response pair is distinct and mirrors the way the YouTuber engages with their audience.
    Transcript:
    \`${full_text}\`
    Format your output as follows:
    \`\`\`
    prompt
    -----------
    $prompt_goes_here
    -----------
    response
    -----------
    $response_goes_here
    -----------
    \`\`\``;
    let messages: ChatMessage[] = [{
        role: ChatCompletionRequestMessageRoleEnum.System,
        content: detailedInstruction
    }];

    if (prevExamples && prevExamples.length) {
    // Sample up to 8 previous examples to use
    const sampledExamples = prevExamples.length > 8 ? shuffleArray(prevExamples).slice(0, 8) : prevExamples;
    sampledExamples.forEach(example => {
      messages.push({ role: "assistant", content: example });
    });
  }

    const response = await openAI.chat.completions.create({
        model: "gpt-3.5-turbo-0125",
        messages: messages,
        temperature: temperature,
        max_tokens: 1000,
    });

    // const messageContent = await response.json() 
    console.log(`Data generated.....${index}`)
    return response.choices[0].message.content
}




const generateSystemMessages = async (prompt: string)=>{
    console.log("Genereting system message...")
    const response = await openAI.chat.completions.create({
          model: "gpt-3.5-turbo-0125",
          messages:[{
              "role": "system",
              "content": "You will be given a high-level description of the model we are training, and from that, you will generate a simple system prompt for that model to use. Your prompt should encourage the model to generate responses that capture the unique style, tone, and content focus of a YouTuber based on the transcripts of their videos. Remember to frame the prompt to guide the model during inference, emphasizing impersonation accuracy. A good format to follow is `Given $INPUT_DATA, you will $WHAT_THE_MODEL_SHOULD_DO.`.\n\nMake it as concise as possible. Include nothing but the system prompt in your response.\n\nFor example, never write: `\"$SYSTEM_PROMPT_HERE\"`.\n\nIt should be like: `$SYSTEM_PROMPT_HERE`."
          }, {
              "role": "user",
              "content": prompt.trim(),
          }],
          temperature: temperature,
          max_tokens: 500,
      });
      // const messageContent = await response.json();
      console.log("System message generated...")
      return response.choices[0].message.content;
}



const parseExamplesToObjects = (prevExamples: string[])=>{
    const prompts: string[] = [];
    const responses: string[] = [];
     for (const example of prevExamples) {
        const splitExample = example.split('-----------');
        if (splitExample.length >= 4) {
            prompts.push(splitExample[1].trim());
            responses.push(splitExample[3].trim());
        }
    }
    const examples: Example[] = prompts.map((prompt, index) => ({
        prompt: prompt,
        response: responses[index]
    }));
  console.log("Parsed examples...")
    return examples;
}




const saveTrainingData = async (data: any[], systemMessage: string | null): Promise<string>=>{
    console.log("Saving training data...")
      // Convert the data array of objects into the desired format
      const trainingExamples = data.map(item => ({
        messages: [
            { role: "system", content: systemMessage },
            { role: "user", content: item.prompt },
            { role: "assistant", content: item.response }
        ]
    }));
    // Create a promise that resolves when the stream finishes
    const writeFilePromise: Promise<string> = new Promise((resolve, reject) => {
      const stream = fs.createWriteStream('training_examples.jsonl', { flags: 'w' });
      // Write the training examples to the file
      trainingExamples.forEach(example => {
          stream.write(JSON.stringify(example) + '\n');
      });
  
      stream.end();
  
      stream.on('finish', () => {
          console.log('Training data saved');
          resolve("training_examples.jsonl"); // Resolve the promise with the file name
      });
  
      stream.on('error', (error) => {
          console.error('Error writing file:', error);
          reject(error); // Reject the promise if an error occurs
      });
  });
      console.log("Returning from fileSave....")
      return await writeFilePromise;
}




const initiateFinetuning = async (filePath: string)=>{
    console.log("Initiating fine tuning...")
    if (!fs.existsSync(filePath)) {
      throw new Error('File does not exist: ' + filePath);
    } 
    try {
      // Read the file and upload it to OpenAI
      console.log("Creating file in openai...")
      const fileStream = await fs.createReadStream(filePath);
      const fileResponse = await openAI.files.create({
          file: fileStream,
          purpose: 'fine-tune'
      });
  
      // Create a fine-tuning job with the uploaded file
      console.log("Starting fine tuning job in openai...")
      const job = await openAI.fineTuning.jobs.create({
          training_file: fileResponse.id,
          model: "gpt-3.5-turbo"
      });
  
      console.log("Fine tuning job started successfully...")
      return job.id;
    } catch (error: any) {
        console.error('Error initiating fine-tuning:', error.message);
        throw error;
    }
}






const createTunedModel = async (jobId: string) => {
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
  }






  const updateChat = async (chatId:string, chatForUpdate: {})=>{
    console.log("Updating chat data with modelName and provider....")
    try {
      console.log("updating...", chatId)
      const newChat = {...chatForUpdate}
      const response = await fetch(`https://vendor-ecru.vercel.app/api/chat`, {
          method: "PUT",
          headers: {
              "Content-Type": "application/json"
          },
          body: JSON.stringify({chatId: chatId, newChat: newChat })
      });
      const updatedChat = await response.json();
      console.log(response.status, "response after updating attempt")
      return updatedChat
    } catch (error: any) {
      console.log("Error while updating the chat", error.message)
      throw error
    }
  }






app.post('/createModel', async (req: Request , res: Response) => {
    const { video_ids, currentChat } = await req.body;
    console.log(video_ids, "video_ids from body....");

    if (!video_ids.length || !Array.isArray(video_ids)) {
        return res.status(400).json('Invalid video IDs provided.');
    }

    try {
        // Your existing logic
        const fullTexts = await Promise.all(video_ids.map(video_id => getTranscript(video_id)));
        const texts = fullTexts.map((item) => {
            return item.map((subItem) => subItem.text).join(" ");
        }) as string[]

        let prevExamples: any[] = [];
        for (const fullText of texts) {
            let resultsForText: any[] = [];
            for (let i = 0; i < 10; i++) {
                const data = await generateData(prompt, fullText, prevExamples, temperature, i);
                resultsForText.push(data);
            }
            prevExamples = [...prevExamples, ...resultsForText];
        }

        const systemMessages = await generateSystemMessages(prompt);
        const parsedExamples = parseExamplesToObjects(prevExamples);
        const filePath: string = await saveTrainingData(parsedExamples, systemMessages);
        const fineTuningId = await initiateFinetuning(filePath);
        const createdModel = await createTunedModel(fineTuningId);
        console.log("created model.....", createdModel)

        if (createdModel) {
            const newChat = {
                ...currentChat,
                baseModel: createdModel,
                provider: 'gpt',
            };
            console.log(newChat, "newChat.....")
            const updateLog = await updateChat(currentChat._id, newChat);
            console.log("update log.......", updateLog);
        } else {
            console.log('Model name not returned from the service');
        }

        return res.status(200).json({ model_name: createdModel });
    } catch (error) {
        console.error('Error during model creation:', error);
        return res.status(500).json(error);
    }
});


app.listen(port,'0.0.0.0', () => {
    console.log(`App running on http://localhost:${port}`);
});