require("dotenv").config();
const express = require("express");
const path = require("path");
const multer = require("multer");
const fs = require("fs");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const app = express();
const upload = multer({ dest: "uploads/" });

if (!process.env.GEMINI_API_KEY) {
  console.error("ERROR: No ENV");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.post("/get", upload.single("file"), async (req, res) => {
  const userInput = req.body.msg;
  const file = req.file;

  if (userInput.toLowerCase() === "who are you") {
    const candidate = "🌍 Hello, world! 🌍 I'm Ostwald, an AI assistant created to make your life easier, more productive, and a lot more fun. Whether you're curious, seeking support, or just in need of a good chat, I'm here for you. Let's explore the endless possibilities together!.";
    return res.send(candidate);
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    let prompt = [userInput];

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
