const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { exec, execSync } = require('child_process');

let settings = {
  areModulesLoaded: false,
  pathToCscalpFolder: false,
};

if (fs.existsSync('settings.json')) {
  settings = fs.readFileSync('settings.json', 'utf8');
  settings = JSON.parse(settings);
} else {
  fs.writeFileSync('settings.json', JSON.stringify(settings));
}

if (!settings.areModulesLoaded) {
  const result = execSync('npm i --loglevel=error');
  settings.areModulesLoaded = true;
  updateSettings();
}

const {
  getExchangeInfo,
} = require('./binance/get-exchange-info');

const {
  getInstrumentsPrices,
} = require('./binance/get-instruments-prices');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

let percentForCalculate = false;

const start = async () => {
  if (!settings.pathToCscalpFolder) {
    return askQuestion('whereCScalpFolder');
  }

  const pathToSettingsFolder = `${settings.pathToCscalpFolder}\\SubApps\\CScalp\\Data\\MVS`;

  if (!fs.existsSync(pathToSettingsFolder)) {
    console.log('Не нашел папку с настройками cscalp');
    return askQuestion('whereCScalpFolder');
  }

  if (!percentForCalculate) {
    return askQuestion('percentForCalculate');
  }

  const resultGetExchangeInfo = await getExchangeInfo();

  if (!resultGetExchangeInfo || !resultGetExchangeInfo.status) {
    console.log(resultGetExchangeInfo.message || 'Cant resultGetExchangeInfo');
    return false;
  }

  const resultGetInstrumentsPrices = await getInstrumentsPrices();

  if (!resultGetInstrumentsPrices || !resultGetInstrumentsPrices.status) {
    console.log(resultGetInstrumentsPrices.message || 'Cant resultGetInstrumentsPrices');
    return false;
  }

  const exchangeInfo = resultGetExchangeInfo.result;
  const instrumentsPrices = resultGetInstrumentsPrices.result;

  const filesNames = fs.readdirSync(pathToSettingsFolder);

  await Promise.all(exchangeInfo.symbols.map(async symbol => {
    const symbolName = symbol.symbol;

    if (!symbol.filters || !symbol.filters.length || !symbol.filters[0].tickSize) {
      console.log(`Cant find tickSize for instrument; symbol: ${symbolName}`);
      return null;
    }

    const instrumentPriceDoc =  instrumentsPrices.find(doc => doc.symbol === symbolName);

    if (!instrumentPriceDoc) {
      console.log(`Cant find price for instrument; symbol: ${symbolName}`);
      return null;
    }

    const instrumentPrice = parseFloat(instrumentPriceDoc.price);
    const tickSize = parseFloat(symbol.filters[0].tickSize);

    const numberTicks = Math.floor(instrumentPrice / tickSize);

    filesNames.forEach(async fileName => {
      if (!fileName.includes(symbolName)) {
        return true;
      }

      if (!fileName.includes(`CCUR_FUT.${symbolName}`)) {
        return true;
      }

      const fileContent = fs.readFileSync(`${pathToSettingsFolder}/${fileName}`, 'utf8');
      const parsedContent = await xml2js.parseStringPromise(fileContent);

      parsedContent.Settings.TRADING[0].StopLoss_Steps[0].$.Value = numberTicks.toString();

      const builder = new xml2js.Builder();
      const xml = builder.buildObject(parsedContent);
      fs.writeFileSync(`${pathToSettingsFolder}/${fileName}`, xml);
    });

    console.log(`Ended ${symbolName}`);
  }));

  console.log('Process was finished');
};

const askQuestion = (nameStep) => {
  if (nameStep === 'whereCScalpFolder') {
    rl.question('Укажите полный путь к папке cscalp\n', userAnswer => {
      if (!userAnswer) {
        console.log('Вы ничего не ввели');
        return askQuestion('whereCScalpFolder');
      }

      if (!fs.existsSync(userAnswer)) {
        console.log('Не нашел папку');
        return askQuestion('whereCScalpFolder');
      }

      settings.pathToCscalpFolder = userAnswer;
      updateSettings();

      return start();
    });
  }

  if (nameStep === 'percentForCalculate') {
    rl.question('На каком % от цены устанавливать stop-loss?\n', userAnswer => {
      if (!userAnswer) {
        console.log('Вы ничего не ввели');
        return askQuestion('percentForCalculate');
      }

      if (Number.isNaN(parseFloat(userAnswer))) {
        console.log('Невалидные данные');
        return askQuestion('percentForCalculate');
      }

      percentForCalculate = parseFloat(userAnswer);
      return start();
    });
  }
};

const updateSettings = () => {
  fs.writeFileSync('settings.json', JSON.stringify(settings));
};

start();
