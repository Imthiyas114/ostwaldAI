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
    console.log(response); // Log the response object for debugging

    const candidate = response?.response?.candidates?.[0]?.content?.parts?.[0];

    if (candidate?.text) {
      const generatedText = candidate.text;
      res.send(generatedText);
    } else {
      res.status(500).send("Invalid response format from AI model");
    }
  } catch (error) {
    console.error("Error generating response", error);
    res.status(error.status || 500).send("Error occurred while generating response");
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
