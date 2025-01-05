require("dotenv").config();
const express = require("express");
const path = require("path");
const multer = require("multer");
const fs = require("fs");
const mongoose = require("mongoose");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const app = express();
const upload = multer({ dest: "uploads/" });

if (!process.env.GEMINI_API_KEY) {
  console.error("ERROR: No ENV");
  process.exit(1);
}

// MongoDB connection setup
const uri = process.env.MONGODB_URI;  // Use the connection string from .env
mongoose.connect(uri, {
  serverSelectionTimeoutMS: 5000, // 5 seconds
  socketTimeoutMS: 45000, // 45 seconds
})
.then(() => console.log("Connected to MongoDB"))
.catch((error) => console.error("MongoDB connection error:", error));

// Define a schema and model for storing messages and user context
const messageSchema = new mongoose.Schema({
  sender: String,
  message: String,
  timestamp: { type: Date, default: Date.now }
});

const contextSchema = new mongoose.Schema({
  userId: String,
  context: String
});

const Message = mongoose.model("Message", messageSchema);
const UserContext = mongoose.model("UserContext", contextSchema);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.post("/get", upload.single("file"), async (req, res) => {
  const userInput = req.body.msg;
  const file = req.file;

  // Store user message
  const userMessage = new Message({ sender: "user", message: userInput });
  await userMessage.save();

  // Retrieve or update user context
  const userId = "unique_user_id";  // You might want to generate or retrieve this from a session
  let userContext = await UserContext.findOne({ userId });

  if (!userContext) {
    userContext = new UserContext({ userId, context: '' });
  }

  userContext.context += ` ${userInput}`;
  await userContext.save();

  if (userInput.toLowerCase().includes("my name is ")) {
    const name = userInput.split("my name is ")[1].trim();
    userContext.context += ` (name: ${name})`;
    await userContext.save();
    return res.send(`Got it, ${name}!`);
  }

  if (userInput.toLowerCase().includes("who am i") || userInput.toLowerCase().includes("tell me my name")) {
    const nameMatch = userContext.context.match(/\(name: (.+?)\)/);
    if (nameMatch) {
      return res.send(`You are ${nameMatch[1]}.`);
    } else {
      return res.send("I'm sorry, I don't remember your name. Could you tell me again?");
    }
  }

  // Retrieve previous messages from the database
  const previousMessages = await Message.find().sort({ timestamp: 1 }).exec();
  const conversationHistory = previousMessages.map(msg => `${msg.sender}: ${msg.message}`).join("\n");

  if (userInput.toLowerCase() === "who are you") {
    const candidate = "🌍 Hello, world! 🌍 I'm Ostwald, an AI assistant created to make your life easier, more productive, and a lot more fun. Whether you're curious, seeking support, or just in need of a good chat, I'm here for you. Let's explore the endless possibilities together!.";
    return res.send(candidate);
  }

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY); // Initialize here
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    let prompt = [`Context: ${userContext.context}\nYou: ${userInput}`];

    if (file) {
      const fileData = fs.readFileSync(file.path);
      const image = {
        inlineData: {
          data: fileData.toString("base64"),
          mimeType: file.mimetype,
        },
      };
      prompt.push(image);
    }

    const response = await model.generateContent(prompt);
    console.log(response); 

    const candidate = response?.response?.candidates?.[0]?.content?.parts?.[0];

    if (candidate?.text) {
      const generatedText = candidate.text;

      const botMessage = new Message({ sender: "Ostwald", message: generatedText });
      await botMessage.save();

      return res.send(generatedText);
    } else {
      return res.status(500).send("Invalid response format from AI model");
    }
  } catch (error) {
    console.error("Error generating response", error);
    return res.status(error.status || 500).send("Error occurred while generating response");
  } finally {
    if (file) {
      fs.unlinkSync(file.path);
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at ${PORT}`);
});
