require('dotenv').config();

const path = require('path');
const express = require('express');
const classifyRouter = require('./src/routes/classify');
const reportRouter = require('./src/routes/report');

if (!process.env.QR_SIGNING_SECRET) {
  throw new Error('QR_SIGNING_SECRET is not set — see .env.example');
}

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

app.use(classifyRouter);
app.use(reportRouter);

app.get('/', (req, res) => {
  res.send('smart-waste-reports API');
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

module.exports = app;
