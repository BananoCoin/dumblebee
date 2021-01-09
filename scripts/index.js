'use strict';
// libraries
const Discord = require( 'discord.js' );
const crypto = require('crypto');
const bananojs = require('@bananocoin/bananojs');
var qr = require('qr-image');
// modules

// constants
const entropyList = [];
let entropySeed = crypto.randomBytes(32);

const SEED_IX = 0;
const config = require('./config.json');
const configOverride = require('../config.json');
const discordClient = new Discord.Client();

const getRandom = (min, max) => {
  if (max == min) {
    return min;
  }
  const range = max - min;
  fillEntropy();
  let entropy = entropyList.shift();
  let maxEntropy = 256;
  while (maxEntropy < range) {
    fillEntropy();
    maxEntropy *= 256;
    entropy *= 256;
    entropy += entropyList.shift();
  }
  const scaledEntropy = (entropy / maxEntropy) * range;
  const retval = min + scaledEntropy;
  return retval;
};

const getRandomInt = (min, max) => {
  return Math.floor(getRandom(Math.floor(min), Math.floor(max)));
};

const fillEntropy = () => {
  if (entropyList.length < 32) {
    const seedHash = crypto.createHash('sha256')
        .update(entropySeed)
        .digest();
    for (let x = 0; x < seedHash.length; x++) {
      entropyList.push(seedHash[x]);
    }
    entropySeed = seedHash;
  }
};

const getSeedFromDiscordId = (authorId) => {
  const seedHash = crypto.createHash('sha256')
      .update(config.discordIdSeed)
      .update(`${authorId}`)
      .digest();
  return seedHash.toString('hex');
};

function getUserFromMention(mention) {
  if (!mention) return;

  if (mention.startsWith('<@') && mention.endsWith('>')) {
    mention = mention.slice(2, -1);

    if (mention.startsWith('!')) {
      mention = mention.slice(1);
    }

    return discordClient.users.cache.get(mention);
  }
}

const isObject = function(obj) {
  return (!!obj) && (obj.constructor === Object);
};

const overrideValues = (src, dest) => {
  Object.keys(src).forEach((key) => {
    const srcValue = src[key];
    const destValue = dest[key];
    if (isObject(destValue)) {
      overrideValues(srcValue, destValue);
    } else {
      dest[key] = srcValue;
    }
  });
};

const overrideConfig = () => {
  overrideValues(configOverride, config);
};

const getBananoAmountDesc = (amount) => {
  const bananoParts = bananojs.getBananoPartsFromRaw(amount);
  return bananojs.getBananoPartsDescription(bananoParts);
};

const receivePending = async (representative, seed, channel) => {
  const account = bananojs.getBananoAccountFromSeed(seed, SEED_IX);
  let noPending = false;
  while (!noPending) {
    const pending = await bananojs.getAccountsPending([account], config.maxPendingBananos, true);
    const pendingBlocks = pending.blocks[account];
    // console.log('pendingBlocks', pendingBlocks);
    const hashes = [...Object.keys(pendingBlocks)];
    if (hashes.length !== 0) {
      const hash = hashes[0];
      const response = await bananojs.receiveBananoDepositsForSeed(seed, SEED_IX, representative, hash);

      console.log('response', response);
      const embed = new Discord.MessageEmbed()
          .setColor('#DBA250')
          .setTitle('receive');
      embed.addFields( {name: 'account', value: account});
      if (response.pendingMessage) {
        embed.addFields( {name: 'Pending', value: response.pendingMessage});
      }
      if (response.receiveMessage) {
        embed.addFields( {name: 'Receive', value: response.receiveMessage});
      }
      channel.send(embed);
    } else {
      noPending = true;
    }
  }
};

const init = async () => {
  process.on('SIGINT', closeProgram);
  overrideConfig();
  fillEntropy();
  bananojs.setBananodeApiUrl(config.bananodeApiUrl);

  const walletAccount = bananojs.getBananoAccountFromSeed(config.walletSeed, SEED_IX);

  discordClient.on('message', async (message) => {
    const authorId = message.author.id;
    const seed = getSeedFromDiscordId(authorId);
    const account = bananojs.getBananoAccountFromSeed(seed, SEED_IX);

    if (message.content.startsWith(config.botPrefix) && (!message.author.bot)) {
      if (message.content === `${config.botPrefix}help`) {
        message.react(config.botEmoji);
        const embed = new Discord.MessageEmbed()
            .setColor('#DBA250')
            .setTitle('help commands');
        embed.addFields(
            {name: `${config.botPrefix}help`, value: 'show help'},
            {name: `${config.botPrefix}account`, value: 'show account'},
            {name: `${config.botPrefix}accountinfo`, value: 'show account and pending block info'},
            {name: `${config.botPrefix}receive`, value: 'receive pending'},
            {name: `${config.botPrefix}send`, value: 'send <amount> <account>'},
            {name: `${config.botPrefix}tip`, value: 'tip <amount> <discord-id>'},
        );

        message.channel.send(embed);
      }
      if (message.content === `${config.botPrefix}account`) {
        message.react(config.botEmoji);
        message.channel.send(account);
        var qr_svg = qr.image(account, { type: 'png' });
        qr_svg.pipe(require('fs').createWriteStream('account.png'));
        const attachment = new Discord.MessageAttachment('./account.png');
        message.channel.send(attachment);

      }
      if (message.content === `${config.botPrefix}accountinfo`) {
        message.react(config.botEmoji);
        const embed = new Discord.MessageEmbed()
            .setColor('#DBA250')
            .setTitle('account info');
        embed.addFields( {name: 'account', value: account});

        const accountInfo = await bananojs.getAccountInfo(account, true);
        if (accountInfo.error !== undefined) {
          embed.addFields( {name: 'error', value: accountInfo.error});
        }
        if (accountInfo.balance !== undefined) {
          embed.addFields( {name: 'balance', value: getBananoAmountDesc(accountInfo.balance)});
        }
        if (accountInfo.modified_timestamp !== undefined) {
          embed.addFields( {name: 'last change', value: new Date(accountInfo.modified_timestamp*1000).toISOString()});
        }
        await receivePending(walletAccount, seed, message.channel);

        const pending = await bananojs.getAccountsPending([account], config.maxPendingBananos, true);

        console.log('accountInfo', accountInfo);
        // console.log('pending', pending);

        const pendingBlocks = pending.blocks[account];
        // console.log('pendingBlocks', pendingBlocks);
        const keys = [...Object.keys(pendingBlocks)];
        keys.forEach((hash, hashIx) => {
          const amount = pendingBlocks[hash].amount;
          const source = pendingBlocks[hash].source;
          const bananoAmountDesc = getBananoAmountDesc(amount);

          if (hashIx > 0) {
            embed.addField('\u200b', '\u200b');
          }
          embed.addFields( {name: 'pending block', value: `${hashIx+1} of ${keys.length}`});
          embed.addFields( {name: 'hash', value: hash, inline: true});
          embed.addFields( {name: 'source', value: source, inline: true});
          embed.addFields( {name: 'amount', value: bananoAmountDesc, inline: true});
        });

        message.channel.send(embed);
      }
      if (message.content === `${config.botPrefix}recieve`) {
        message.react('❌');
        const embed = new Discord.MessageEmbed()
            .setColor('#DBA250')
            .setTitle('help command for receive');
        embed.addFields(
            {name: `${config.botPrefix}receive`, value: 'receive pending'},
        );
        message.channel.send(embed);
      }
      if (message.content === `${config.botPrefix}receive`) {
        message.react(config.botEmoji);
        await receivePending(walletAccount, seed, message.channel);
      }
      if (message.content.startsWith(`${config.botPrefix}send`)) {
        message.react(config.botEmoji);
        const words = message.content.substring(config.botPrefix.length).split(' ');
        if (words.length < 3) {
          message.react('❌');
          const embed = new Discord.MessageEmbed()
              .setColor('#DBA250')
              .setTitle('help command for send');
          embed.addFields(
              {name: `${config.botPrefix}send`, value: 'send <amount> <account>'},
          );
          message.channel.send(embed);
          return;
        }
        await receivePending(walletAccount, seed, message.channel);
        const amount = words[1];
        const toAccount = words[2];
        const rawStr = bananojs.getBananoDecimalAmountAsRaw(amount);
        const rawStrDesc = getBananoAmountDesc(rawStr);
        const embed = new Discord.MessageEmbed()
            .setColor('#DBA250')
            .setTitle('send');
        embed.addFields(
            {name: 'amount', value: amount},
            // {name: 'bananoBigInt', value: bananoBigInt},
            // {name: 'banoshiBigInt', value: banoshiBigInt},
            // {name: 'rawStr', value: rawStr},
            {name: 'description', value: rawStrDesc},
            {name: 'to account', value: toAccount},
        );

        try {
          const response = await bananojs.sendAmountToBananoAccountWithRepresentativeAndPrevious(seed, SEED_IX, toAccount, rawStr);

          console.log('send', 'response', response);

          embed.addFields(
              {name: 'response', value: JSON.stringify(response)},
          );
        } catch (error) {
          console.log('send', 'error', error.message);

          embed.addFields(
              {name: 'error', value: error.message},
          );
        }

        message.channel.send(embed);
      }
      if (message.content.startsWith(`${config.botPrefix}tip`)) {
        message.react(config.botEmoji);
        const words = message.content.substring(config.botPrefix.length).split(' ');
        if (words.length < 3) {
          message.react('❌');
          const embed = new Discord.MessageEmbed()
              .setColor('#DBA250')
              .setTitle('help command for tip');
          embed.addFields(
              {name: `${config.botPrefix}tip`, value: 'tip <amount> <discord-id>'},
          );
          message.channel.send(embed);
          return;
        }
        await receivePending(walletAccount, seed, message.channel);
        const amount = words[1];
        const toUser = getUserFromMention(words[2]);
        console.log('tip', 'toUser', toUser);
        const toSeed = getSeedFromDiscordId(toUser.id);
        const toAccount = bananojs.getBananoAccountFromSeed(toSeed, SEED_IX);
        const rawStr = bananojs.getBananoDecimalAmountAsRaw(amount);
        const rawStrDesc = getBananoAmountDesc(rawStr);
        const embed = new Discord.MessageEmbed()
            .setColor('#DBA250')
            .setTitle('send')
            .setAuthor(`${toUser.username}#${toUser.discriminator}`, toUser.displayAvatarURL());
        embed.addFields(
            {name: 'amount', value: amount},
            // {name: 'bananoBigInt', value: bananoBigInt},
            // {name: 'banoshiBigInt', value: banoshiBigInt},
            // {name: 'rawStr', value: rawStr},
            {name: 'description', value: rawStrDesc},
            {name: 'to user', value: `<@${toUser.id}>`},
            {name: 'to account', value: toAccount},
        );

        try {
          const response = await bananojs.sendAmountToBananoAccountWithRepresentativeAndPrevious(seed, SEED_IX, toAccount, rawStr);

          console.log('tip', 'response', response);

          embed.addFields(
              {name: 'response', value: JSON.stringify(response)},
          );
        } catch (error) {
          console.log('tip', 'error', error.message);

          embed.addFields(
              {name: 'error', value: error.message},
          );
        }

        message.channel.send(embed);
      }
    }
  });
  discordClient.login(config.token);
  console.log('started');
};

const deactivate = async () => {

};

const closeProgram = async () => {
  console.log('STARTED closing program.');
  await deactivate();
  console.log('SUCCESS closing program.');
  process.exit(0);
};

init()
    .catch((e) => {
      console.log('FAILURE init.', e.message);
      console.trace('FAILURE init.', e);
    });
