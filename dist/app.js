"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require('dotenv').config();
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const openai_1 = __importDefault(require("openai"));
const axios_1 = __importDefault(require("axios"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const app = (0, express_1.default)();
const port = 8000;
app.use(express_1.default.json({ limit: '100mb' }));
app.use((0, cors_1.default)());
// const openAI = new OpenAI({
//   apiKey: process.env.OPENAI_API_KEY,
// });
const openAI = new openai_1.default({
    apiKey: "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",
});
const downloadFileFromUrl = (url) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Fetch the file from the URL
        const response = yield (0, axios_1.default)({
            method: 'get',
            url: url,
            responseType: 'stream'
        });
        // Create a temporary file
        const tempDir = os_1.default.tmpdir();
        const tempFilePath = path_1.default.join(tempDir, `openai-upload-${Date.now()}.jsonl`);
        // Create a write stream
        const writer = fs_1.default.createWriteStream(tempFilePath);
        // Pipe the response data to the file
        response.data.pipe(writer);
        // Return a promise that resolves when the file is fully written
        yield new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
        return tempFilePath;
    }
    catch (error) {
        console.error('Error downloading file:', error);
        throw error;
    }
});
const getFileId = (model) => __awaiter(void 0, void 0, void 0, function* () {
    let fileId;
    if (model.fileType === 'upload') {
        console.log('i am here....');
        const filePath = yield downloadFileFromUrl(model.trainingFile);
        const fileResponse = yield openAI.files.create({
            file: fs_1.default.createReadStream(filePath),
            purpose: 'fine-tune'
        });
        console.log(fileResponse.id, 'fileId.....');
        fileId = fileResponse.id;
        yield fs_1.default.promises.unlink(filePath);
    }
    else {
        fileId = model.fileId;
    }
    return fileId;
});
const getValidationFileId = (model) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    let fileId;
    if (model.validationFileType === 'upload') {
        if (((_a = model === null || model === void 0 ? void 0 : model.validationFile) === null || _a === void 0 ? void 0 : _a.length) > 0) {
            const filePath = yield downloadFileFromUrl(model.validationFile);
            const fileResponse = yield openAI.files.create({
                file: fs_1.default.createReadStream(filePath),
                purpose: 'fine-tune'
            });
            fileId = fileResponse.id;
            yield fs_1.default.promises.unlink(filePath);
        }
        else {
            fileId = '';
        }
    }
    else if (model.validationFileType === 'existing') {
        fileId = model.fileId;
    }
    else {
        fileId = '';
    }
    return fileId;
});
const formatHyperParemeters = (model) => __awaiter(void 0, void 0, void 0, function* () {
    var _b, _c, _d;
    let parameters = {};
    if (((_b = model.batchSize) === null || _b === void 0 ? void 0 : _b.length) > 0) {
        const batchSize = parseInt(model.batchSize);
        if (batchSize > 0) {
            parameters.batch_size = batchSize;
        }
        else {
            parameters.batch_size = 'auto';
        }
    }
    else {
        parameters.batch_size = 'auto';
    }
    if (((_c = model.learningRate) === null || _c === void 0 ? void 0 : _c.length) > 0) {
        parameters.learning_rate_multiplier = parseInt(model.learningRate);
    }
    else {
        parameters.learning_rate_multiplier = 'auto';
    }
    if (((_d = model.epoches) === null || _d === void 0 ? void 0 : _d.length) > 0) {
        parameters.n_epochs = parseInt(model.epoches);
    }
    else {
        parameters.n_epochs = 'auto';
    }
    return parameters;
});
const initiateFinetuning = (config) => __awaiter(void 0, void 0, void 0, function* () {
    console.log("Initiating fine tuning...");
    try {
        // Create a fine-tuning job with the uploaded file
        console.log("Starting fine tuning job in openai...");
        const job = yield openAI.fineTuning.jobs.create(config);
        console.log("Fine tuning job started successfully...");
        return job.id;
    }
    catch (error) {
        console.error('Error initiating fine-tuning:', error.message);
        throw error;
    }
});
const checkStatusAndGetBaseModel = (jobId) => __awaiter(void 0, void 0, void 0, function* () {
    console.log("Start creating model....");
    while (true) {
        try {
            console.log("Getting job details....");
            const jobDetails = yield openAI.fineTuning.jobs.retrieve(jobId);
            const jobStatus = jobDetails.status;
            if (jobStatus === 'succeeded') {
                console.log("Getting model name....");
                const modelName = jobDetails.fine_tuned_model;
                console.log('Model Created:', modelName);
                return modelName;
            }
            else if (jobStatus === 'failed' || jobStatus === 'cancelled') {
                console.log(`Job ${jobStatus}, unable to create model.`);
                return null;
            }
            else {
                console.log(`Job still in progress: ${jobStatus}. Checking again in 60 seconds.`);
                yield new Promise(resolve => setTimeout(resolve, 60000)); // Sleep for 60 seconds
            }
        }
        catch (error) {
            console.error('Error retrieving job details:', error);
            throw error; // or handle the error as needed
        }
    }
});
const updatemodel = (modelId, modelForUpdate) => __awaiter(void 0, void 0, void 0, function* () {
    console.log("Updating model....");
    try {
        console.log("updating...", modelId);
        const newModel = Object.assign({}, modelForUpdate);
        const response = yield (0, node_fetch_1.default)(`https://vendor.com/api/fineTune/openai`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ modelId: modelId, newModel: newModel })
        });
        const updatedmodel = yield response.json();
        console.log(response.status, "response after updating attempt");
        return updatedmodel;
    }
    catch (error) {
        console.log("Error while updating the model", error.message);
        throw error;
    }
});
const getModelById = (modelId) => __awaiter(void 0, void 0, void 0, function* () {
    console.log("Getting model....");
    try {
        console.log("Getting...", modelId);
        const response = yield (0, node_fetch_1.default)(`https://vendor-ecru.vercel.app/api/fineTune/openai/getModelById${modelId}`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json"
            }
        });
        const model = yield response.json();
        return model;
    }
    catch (error) {
        console.log("Error while updating the model", error.message);
        throw error;
    }
});
app.post('/createModel', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _e, _f;
    const { currentModel } = yield req.body;
    try {
        console.log('starting the process......');
        const fileId = yield getFileId(currentModel);
        console.log(fileId, 'file id....');
        let config = {
            training_file: fileId,
            model: currentModel.baseModel
        };
        const validationFileId = yield getValidationFileId(currentModel);
        if ((validationFileId === null || validationFileId === void 0 ? void 0 : validationFileId.length) > 0) {
            config.validation_file = validationFileId;
        }
        ;
        if (((_e = currentModel === null || currentModel === void 0 ? void 0 : currentModel.suffix) === null || _e === void 0 ? void 0 : _e.length) > 0) {
            config.suffix = currentModel.suffix;
        }
        ;
        if (((_f = currentModel === null || currentModel === void 0 ? void 0 : currentModel.seed) === null || _f === void 0 ? void 0 : _f.length) > 0) {
            config.seed = parseInt(currentModel.seed);
        }
        ;
        const hyperParameters = yield formatHyperParemeters(currentModel);
        config.hyperparameters = hyperParameters;
        const fineTuningId = yield initiateFinetuning(config);
        const createdModel = yield checkStatusAndGetBaseModel(fineTuningId);
        console.log("created model.....", createdModel);
        const getmodel = yield getModelById(currentModel._id);
        if (createdModel) {
            const newModel = Object.assign(Object.assign({}, getmodel), { createdModel: createdModel, status: 'active' });
            const updateLog = yield updatemodel(currentModel._id, newModel);
            console.log("model updated successfully with model name...", updateLog);
        }
        else {
            console.log('Model name not returned from the service');
        }
        return res.status(200).json({ model_name: createdModel });
    }
    catch (error) {
        console.error('Error during model creation:', error);
        return res.status(500).json(error);
    }
}));
app.listen(port, '0.0.0.0', () => {
    console.log(`Model creation running on ${port}`);
});
// /usr/local/bin/yt-dlp https://www.youtube.com/watch?v=msIZQwKy6lc --extract-audio --audio-format mp3 --output /app/668ed5d19ea2a61422caa197output.mp3 --no-check-certificates --no-warnings --prefer-free-formats --add-header "referer:youtube.com" --add-header "user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36" --ffmpeg-location /usr/bin/ffmpeg
// /usr/local/bin/yt-dlp https://www.youtube.com/watch?v=msIZQwKy6lc --extract-audio --audio-format mp3 --output /tmp/668ed5d19ea2a61422caa197output.mp3 --no-check-certificates --no-warnings --prefer-free-formats --add-header "referer:youtube.com" --add-header "user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36" --ffmpeg-location /usr/bin/ffmpeg
