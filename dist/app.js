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
const form_data_1 = __importDefault(require("form-data"));
const fs_1 = __importDefault(require("fs"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const openai_1 = __importDefault(require("openai"));
const openai_edge_1 = require("openai-edge");
const path_1 = __importDefault(require("path"));
const axios_1 = __importDefault(require("axios"));
// constants
const prompt = "Create a model that embodies the persona of a YouTube influencer, learning from video transcripts to mirror their speaking style, tone, and content preferences.";
const temperature = .35;
const app = (0, express_1.default)();
const port = 8000;
app.use(express_1.default.json({ limit: '100mb' }));
app.use((0, cors_1.default)());
const openAI = new openai_1.default({
    apiKey: process.env.OPENAI_API_KEY,
});
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}
const getTranscript = (videoId) => __awaiter(void 0, void 0, void 0, function* () {
    const options = {
        method: 'GET',
        url: 'https://youtube-transcriptor.p.rapidapi.com/transcript',
        params: {
            video_id: videoId,
        },
        headers: {
            'x-rapidapi-host': 'youtube-transcriptor.p.rapidapi.com',
            'x-rapidapi-key': '90287b23damsh24ab22996157a66p178b0fjsn1f40752eeff5'
        }
    };
    const response = yield axios_1.default.request(options);
    const data = yield response.data[0];
    const fullTexts = data.transcriptionAsText;
    // const fullTexts = await YoutubeTranscript.fetchTranscript(videoId);
    console.log("Got the transcript...");
    return fullTexts;
});
const generateData = (prompt_1, full_text_1, prevExamples_1, ...args_1) => __awaiter(void 0, [prompt_1, full_text_1, prevExamples_1, ...args_1], void 0, function* (prompt, full_text, prevExamples, temperature = 0.5, index) {
    console.log(`Generating data.....${index}`);
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
    let messages = [{
            role: openai_edge_1.ChatCompletionRequestMessageRoleEnum.System,
            content: detailedInstruction
        }];
    if (prevExamples && prevExamples.length) {
        // Sample up to 8 previous examples to use
        const sampledExamples = prevExamples.length > 9 ? shuffleArray(prevExamples).slice(0, 9) : prevExamples;
        sampledExamples.forEach(example => {
            messages.push({ role: "assistant", content: example });
        });
    }
    const response = yield openAI.chat.completions.create({
        model: "gpt-3.5-turbo-0125",
        messages: messages,
        temperature: temperature,
        max_tokens: 1000,
    });
    // const messageContent = await response.json() 
    console.log(`Data generated.....${index}`);
    return response.choices[0].message.content;
});
const generateSystemMessages = (prompt) => __awaiter(void 0, void 0, void 0, function* () {
    console.log("Genereting system message...");
    const response = yield openAI.chat.completions.create({
        model: "gpt-3.5-turbo-0125",
        messages: [{
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
    console.log("System message generated...");
    return response.choices[0].message.content;
});
const parseExamplesToObjects = (prevExamples) => {
    const prompts = [];
    const responses = [];
    for (const example of prevExamples) {
        const splitExample = example.split('-----------');
        if (splitExample.length >= 4) {
            prompts.push(splitExample[1].trim());
            responses.push(splitExample[3].trim());
        }
    }
    const examples = prompts.map((prompt, index) => ({
        prompt: prompt,
        response: responses[index]
    }));
    console.log("Parsed examples...");
    return examples;
};
const saveTrainingData = (data, systemMessage) => __awaiter(void 0, void 0, void 0, function* () {
    console.log("Saving training data...");
    // Convert the data array of objects into the desired format
    const trainingExamples = data.map(item => ({
        messages: [
            { role: "system", content: systemMessage },
            { role: "user", content: item.prompt },
            { role: "assistant", content: item.response }
        ]
    }));
    // Create a promise that resolves when the stream finishes
    const writeFilePromise = new Promise((resolve, reject) => {
        const stream = fs_1.default.createWriteStream('training_examples.jsonl', { flags: 'w' });
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
    console.log("Returning from fileSave....");
    return yield writeFilePromise;
});
const initiateFinetuning = (filePath, model) => __awaiter(void 0, void 0, void 0, function* () {
    console.log("Initiating fine tuning...");
    if (!fs_1.default.existsSync(filePath)) {
        throw new Error('File does not exist: ' + filePath);
    }
    try {
        // Read the file and upload it to OpenAI
        console.log("Creating file in openai...");
        const fileStream = yield fs_1.default.createReadStream(filePath);
        const fileResponse = yield openAI.files.create({
            file: fileStream,
            purpose: 'fine-tune'
        });
        const baseModel = model.length > 0 ? model : "gpt-3.5-turbo";
        // Create a fine-tuning job with the uploaded file
        console.log("Starting fine tuning job in openai...");
        const job = yield openAI.fineTuning.jobs.create({
            training_file: fileResponse.id,
            model: baseModel
        });
        console.log("Fine tuning job started successfully...");
        return job.id;
    }
    catch (error) {
        console.error('Error initiating fine-tuning:', error.message);
        throw error;
    }
});
const createTunedModel = (jobId) => __awaiter(void 0, void 0, void 0, function* () {
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
const updateChat = (chatId, chatForUpdate) => __awaiter(void 0, void 0, void 0, function* () {
    console.log("Updating chat....");
    try {
        console.log("updating...", chatId);
        const newChat = Object.assign({}, chatForUpdate);
        const response = yield (0, node_fetch_1.default)(`https://vendor.com/api/chat`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ chatId: chatId, newChat: newChat })
        });
        const updatedChat = yield response.json();
        console.log(response.status, "response after updating attempt");
        return updatedChat;
    }
    catch (error) {
        console.log("Error while updating the chat", error.message);
        throw error;
    }
});
const getActiveUrl = (id) => __awaiter(void 0, void 0, void 0, function* () {
    while (true) {
        const response = yield (0, node_fetch_1.default)(`https://youtube-to-mp315.p.rapidapi.com/status/${id}`, {
            method: "GET",
            headers: {
                "x-rapidapi-host": "youtube-to-mp315.p.rapidapi.com",
                "x-rapidapi-key": "90287b23damsh24ab22996157a66p178b0fjsn1f40752eeff5"
            }
        });
        const data = yield response.json();
        const status = data.status;
        if (status === "AVAILABLE") {
            console.log("conversion done...");
            return data.downloadUrl;
        }
        else if (status === "CONVERSION_ERROR") {
            console.log(`conversion failed....`);
            return '';
        }
        else if (status === "CONVERTING") {
            console.log("Still converting checking in 5 seconds....");
            yield new Promise(resolve => setTimeout(resolve, 5000));
        }
        else {
            console.log(`Status is: ${status}. Exiting...`);
            return "";
        }
    }
});
const extractAndSaveAudio = (url, chat) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const options = {
            method: 'POST',
            url: 'https://youtube-to-mp315.p.rapidapi.com/download',
            params: {
                url: url,
                format: 'mp3'
            },
            headers: {
                'Content-Type': 'application/json',
                'x-rapidapi-host': 'youtube-to-mp315.p.rapidapi.com',
                'x-rapidapi-key': "90287b23damsh24ab22996157a66p178b0fjsn1f40752eeff5"
            }
        };
        const response = yield axios_1.default.request(options);
        const output = path_1.default.resolve(`${chat._id}output.mp3`);
        if (response.status === 200) {
            console.log("Converting youtube to mp3....");
            const responseId = yield response.data.id;
            const url = yield getActiveUrl(responseId);
            console.log(url, "mp3Url......");
            if ((url === null || url === void 0 ? void 0 : url.length) < 1) {
                return "pNInz6obpgDQGcFmaJgB";
            }
            let data;
            let buffer;
            try {
                const res2 = yield (0, node_fetch_1.default)(url, {
                    method: "GET"
                });
                console.log(res2.status, "res2.status");
                data = yield res2.arrayBuffer();
                buffer = yield Buffer.from(new Uint8Array(data));
                yield new Promise((resolve, reject) => {
                    fs_1.default.writeFile(output, buffer, (err) => {
                        if (err) {
                            console.log("Failed to save file", err);
                            reject(err);
                        }
                        else {
                            console.log("File saved successfully...");
                            resolve();
                        }
                    });
                });
                console.log(data, "responseData...");
            }
            catch (err) {
                console.log(`error from download: ${err.message}`);
                return {
                    type: "default",
                    voiceId: "pNInz6obpgDQGcFmaJgB"
                };
            }
            const formData = new form_data_1.default();
            const filePath = yield path_1.default.resolve(`./${chat._id}output.mp3`);
            yield formData.append('files', fs_1.default.createReadStream(filePath));
            formData.append("name", chat._id);
            try {
                console.log("Sending request to ElevenLabs API...");
                const response = yield axios_1.default.post('https://api.elevenlabs.io/v1/voices/add', formData, {
                    headers: Object.assign(Object.assign({}, formData.getHeaders()), { "xi-api-key": "8339ed653a92fb25e0d1f1270121b055" }),
                });
                console.log("Response from ElevenLabs:", response.data);
                const voiceId = response.data.voice_id;
                console.log("Voice ID:", voiceId);
                fs_1.default.unlink(output, (unlinkErr) => {
                    if (unlinkErr)
                        console.error('Error deleting file:', unlinkErr);
                });
                return voiceId;
            }
            catch (error) {
                console.error("Error in ElevenLabs API call:", error.response ? error.response.data : error.message);
                return {
                    type: "default",
                    voiceId: "pNInz6obpgDQGcFmaJgB"
                };
            }
        }
        else {
            console.log("Voice clone failed..");
            return "pNInz6obpgDQGcFmaJgB";
        }
    }
    catch (error) {
        console.error('Error in extractAndSaveAudio:', error.message);
        return "pNInz6obpgDQGcFmaJgB";
    }
});
const getChatById = (chatId) => __awaiter(void 0, void 0, void 0, function* () {
    console.log("Getting chat....");
    try {
        console.log("Getting...", chatId);
        const response = yield (0, node_fetch_1.default)(`https://vendor-ecru.vercel.app/api/chat/getChatById/${chatId}`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json"
            }
        });
        const chat = yield response.json();
        return chat;
    }
    catch (error) {
        console.log("Error while updating the chat", error.message);
        throw error;
    }
});
app.post('/createModel', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { video_ids, currentChat } = yield req.body;
    console.log(video_ids, "video_ids from body....");
    if (!(video_ids === null || video_ids === void 0 ? void 0 : video_ids.length) || !Array.isArray(video_ids)) {
        return res.status(400).json('Invalid video IDs provided.');
    }
    try {
        // Your existing logic
        const urlForVoice = currentChat.voiceUrl;
        let voiceId = '';
        if (currentChat.voiceType === 'clone') {
            voiceId = yield extractAndSaveAudio(urlForVoice, currentChat);
        }
        const texts = yield Promise.all(video_ids.map(video_id => getTranscript(video_id)));
        // const texts = fullTexts.map((item) => {
        //     return item.map((subItem) => subItem.text).join(" ");
        // }) as string[];
        let prevExamples = [];
        for (const fullText of texts) {
            let resultsForText = [];
            for (let i = 0; i <= 10; i++) {
                const data = yield generateData(prompt, fullText, prevExamples, temperature, i);
                resultsForText.push(data);
            }
            prevExamples = [...prevExamples, ...resultsForText];
        }
        const systemMessages = yield generateSystemMessages(prompt);
        const parsedExamples = parseExamplesToObjects(prevExamples);
        const filePath = yield saveTrainingData(parsedExamples, systemMessages);
        const fineTuningId = yield initiateFinetuning(filePath, currentChat.baseModel);
        const createdModel = yield createTunedModel(fineTuningId);
        console.log("created model.....", createdModel);
        const getChat = yield getChatById(currentChat._id);
        if (createdModel) {
            const newChat = Object.assign(Object.assign({}, getChat), { baseModel: createdModel, provider: 'gpt', voiceId: voiceId });
            const updateLog = yield updateChat(currentChat._id, newChat);
            console.log("Chat updated successfully with model name...", updateLog);
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
app.post('/updateModel', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { video_ids, currentChat } = yield req.body;
    console.log(video_ids, "video_ids from body....");
    if (!(video_ids === null || video_ids === void 0 ? void 0 : video_ids.length) || !Array.isArray(video_ids)) {
        return res.status(400).json('Invalid video IDs provided.');
    }
    try {
        // Your existing logic
        const texts = yield Promise.all(video_ids.map(video_id => getTranscript(video_id)));
        // const texts = fullTexts.map((item) => {
        //     return item.map((subItem) => subItem.text).join(" ");
        // }) as string[];
        let prevExamples = [];
        for (const fullText of texts) {
            let resultsForText = [];
            for (let i = 0; i <= 10; i++) {
                const data = yield generateData(prompt, fullText, prevExamples, temperature, i);
                resultsForText.push(data);
            }
            prevExamples = [...prevExamples, ...resultsForText];
        }
        const model = currentChat.baseModel;
        const systemMessages = yield generateSystemMessages(prompt);
        const parsedExamples = parseExamplesToObjects(prevExamples);
        const filePath = yield saveTrainingData(parsedExamples, systemMessages);
        const fineTuningId = yield initiateFinetuning(filePath, model);
        const createdModel = yield createTunedModel(fineTuningId);
        console.log("updated model.....", createdModel);
        const getChat = yield getChatById(currentChat._id);
        if (createdModel) {
            const newChat = Object.assign(Object.assign({}, getChat), { baseModel: createdModel, provider: 'gpt' });
            const updateLog = yield updateChat(currentChat._id, newChat);
            console.log("Chat updated successfully with model name...", updateLog);
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
