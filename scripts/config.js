'use strict';
// libraries
const fs = require('fs');
const crypto = require('crypto');

// modules

// constants
const configFileNm = 'config.json';

// functions
const writeConfig = () => {
  if (fs.existsSync(configFileNm)) {
    console.log(`config file already exists:${configFileNm}`);
  } else {
    const config = {};
    config.walletSeed = crypto.randomBytes(32).toString('hex').toUpperCase();
    config.token = 'NzgzMDE2MjYzNjEzODA4NjYw.X8UmuA.HmVOJ30BTHz3hYYfYae9QwzHfoA';
    config.discordIdSeed = crypto.randomBytes(32).toString('hex').toUpperCase();
    const configFilePtr = fs.openSync(configFileNm, 'w');
    fs.writeSync(configFilePtr, JSON.stringify(config, undefined, 2));
    fs.closeSync(configFilePtr);
    console.log(`created new config file:${configFileNm}`);
  }
};
writeConfig();
