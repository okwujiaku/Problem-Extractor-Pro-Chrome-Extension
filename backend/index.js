const dotenv = require("dotenv");

dotenv.config();

const app = require("./app");

const PORT = Number(process.env.PORT || 8787);

app.listen(PORT, () => {
  console.log(`Problem Extractor Pro backend running on ${PORT}`);
});
