const {
  SlashCommandBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
  ComponentType,
  Collection,
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const activeGames = new Collection();

function loadDictionary(language) {
  const filePath = path.join(__dirname, 'dics', `${language}.txt`);
  const words = fs.readFileSync(filePath, 'utf-8')
    .split(/\r?\n/)
    .map(w => w.trim().toLowerCase())
    .filter(Boolean);
  return new Set(words);
}

function getRandomSequence(dictionary, length = 2) {
  const words = Array.from(dictionary).filter(w => w.length >= length);
  while (true) {
    const word = words[Math.floor(Math.random() * words.length)];
    const start = Math.floor(Math.random() * (word.length - length + 1));
    const seq = word.substring(start, start + length);
    if ([...dictionary].some(w => w.includes(seq))) return seq;
  }
}

function pickAIWord(dictionary, sequence, used) {
  return [...dictionary].find(word => word.includes(sequence) && !used.has(word));
}

function formatLetters(used) {
  const all = 'abcdefghijklmnopqrstuv'.split('');
  return all.map(letter => used.has(letter) ? `🔴${letter}` : `🔵${letter}`).join(' ');
}

function createGameEmbed(userLives, sequence, logs, usedLetters, wordsPlayedCount, elapsedSeconds) {
  return new EmbedBuilder()
    .setTitle('💣 BombParty')
    .setDescription(`**Sequence:** \`${sequence}\``)
    .addFields(
      { name: '❤️ Your Lives', value: userLives.toString(), inline: true },
      { name: '⏳ Elapsed Time', value: `${elapsedSeconds}s`, inline: true },
      { name: '🔢 Words Played', value: wordsPlayedCount.toString(), inline: true },
      { name: '📜 Last 5 Events', value: logs.length > 0 ? logs.map(e => `• **${e.player}**: \`${e.word}\` (${e.seq})`).join('\n') : 'None yet', inline: false },
      { name: '🔠 Used Letters', value: formatLetters(usedLetters), inline: false }
    )
    .setFooter({ text: '🔥 Use every letter of the alphabet above to earn an extra life!' })
    .setColor(0xffcc00);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bombparty')
    .setDescription('Start a BombParty game against AI!')
    .addStringOption(option =>
      option.setName('language')
        .setDescription('Choose language')
        .addChoices(
          { name: 'English', value: 'english' },
          { name: 'French', value: 'french' }
        )
        .setRequired(false))
    .addIntegerOption(option =>
      option.setName('lives')
        .setDescription('Number of lives')
        .setMinValue(1)
        .setMaxValue(10))
    .addIntegerOption(option =>
      option.setName('turn_time')
        .setDescription('Time per turn in seconds')
        .setMinValue(5)
        .setMaxValue(30)),

  async execute(interaction) {
    const language = interaction.options.getString('language') || 'english';
    const lives = interaction.options.getInteger('lives') || 3;
    const turnTime = interaction.options.getInteger('turn_time') || 20;

    if (activeGames.has(interaction.user.id)) {
      return interaction.reply({ content: '⚠️ You already have an ongoing game!', ephemeral: true });
    }

    const dictionary = loadDictionary(language);
    const usedLetters = new Set();
    const usedWords = new Set();
    const logs = [];

    let userLives = lives;
    let currentSeq = getRandomSequence(dictionary, Math.random() < 0.5 ? 2 : 3);
    let turn = 'user';
    let timeout;
    let gameMessage;
    let isGameActive = false;
    let isUpdatingMessage = false; // Prevent race conditions
    const gameStartTime = Date.now();

    // Buttons for game control
    const stopRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('stop_game')
        .setLabel('Stop Game')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🛑')
    );

    const startRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('start_game')
        .setLabel('Start Game')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('cancel_game')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌')
    );

    // Settings embed before game start
    const settingsEmbed = new EmbedBuilder()
      .setTitle('⚙️ Game settings:')
      .addFields(
        { name: 'Language', value: language, inline: true },
        { name: 'Lives', value: userLives.toString(), inline: true },
        { name: 'Turn Time', value: `${turnTime}s`, inline: true }
      )
      .setColor(0xff0000);

    await interaction.reply({ embeds: [settingsEmbed], components: [startRow] });

    const startCollector = interaction.channel.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 30000,
      max: 1
    });

    startCollector.on('collect', async btn => {
      if (btn.user.id !== interaction.user.id) {
        return btn.reply({ content: 'Only the game creator can control this.', ephemeral: true });
      }

      if (!btn.isRepliable()) {
        console.log('Start button interaction is no longer repliable');
        return;
      }

      if (btn.customId === 'cancel_game') {
        await btn.deferUpdate();
        await interaction.editReply({ content: '❌ Game canceled.', embeds: [], components: [] });
        startCollector.stop();
        return;
      }

      if (btn.customId === 'start_game') {
        await btn.deferUpdate();

        activeGames.set(interaction.user.id, true);
        isGameActive = true;

        gameMessage = await interaction.editReply({
          content: `🎮 Game started! You have **${turnTime}s** to type a word containing: \`${currentSeq}\``,
          embeds: [createGameEmbed(userLives, currentSeq, logs, usedLetters, 0, 0)],
          components: [stopRow]
        });

        // Helper to update game message with race condition protection
        async function updateGameMessage() {
          if (!isGameActive || isUpdatingMessage) return;
          isUpdatingMessage = true;
          
          try {
            const elapsedSeconds = Math.floor((Date.now() - gameStartTime) / 1000);
            await gameMessage.edit({
              content: turn === 'user'
                ? `⏳ Your turn! You have **${turnTime}s** to type a word containing: \`${currentSeq}\``
                : `💻 AI's turn...`,
              embeds: [createGameEmbed(userLives, currentSeq, logs.slice(-5), usedLetters, usedWords.size, elapsedSeconds)],
              components: [stopRow],
            });
          } catch (err) {
            console.error('Failed to update game message:', err.message);
            // Don't crash the game on message update failure
          } finally {
            isUpdatingMessage = false;
          }
        }

        // Collect user messages (guesses) - Reduced timeout to prevent interaction expiry
        const msgCollector = interaction.channel.createMessageCollector({
          filter: m => m.author.id === interaction.user.id && isGameActive,
          time: 5 * 60 * 1000 // Reduced from 10 minutes to 5
        });

        // Collect button presses during game
        const btnCollector = gameMessage.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: 5 * 60 * 1000 // Reduced from 10 minutes to 5
        });

        const endGame = async (reason) => {
          if (!isGameActive) return; // Prevent double-ending
          
          isGameActive = false;
          clearTimeout(timeout);
          
          try {
            msgCollector.stop('game_ended');
            btnCollector.stop('game_ended');
          } catch (err) {
            console.error('Error stopping collectors:', err.message);
          }
          
          activeGames.delete(interaction.user.id);

          // Wait for any pending message updates to complete
          while (isUpdatingMessage) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }

          try {
            await gameMessage.edit({
              content: reason,
              embeds: [createGameEmbed(userLives, currentSeq, logs.slice(-5), usedLetters, usedWords.size, Math.floor((Date.now() - gameStartTime) / 1000))],
              components: [],
            });
          } catch (err) {
            console.error('Failed to edit final game message:', err.message);
          }
        };

        const nextTurn = async () => {
          if (!isGameActive) return;
          
          clearTimeout(timeout);

          if (userLives <= 0) {
            userLives = 0;
            await endGame('💻 AI wins! You ran out of lives.');
            return;
          }

          if (turn === 'user') {
            await updateGameMessage();

            timeout = setTimeout(async () => {
              if (!isGameActive) return; // Check if game is still active
              
              userLives--;
              logs.push({ player: '❌ Timeout', word: '—', seq: currentSeq });
              if (logs.length > 5) logs.splice(0, logs.length - 5);
              
              await updateGameMessage();

              if (userLives <= 0) {
                await endGame('💀 You lost! No lives left after timeout.');
                return;
              }

              turn = 'ai';
              await nextTurn();
            }, turnTime * 1000);
          } else {
            // AI turn
            const aiWord = pickAIWord(dictionary, currentSeq, usedWords);
            if (!aiWord) {
              await endGame('🎉 You win! AI cannot find a valid word.');
              return;
            }
            
            usedWords.add(aiWord);
            logs.push({ player: '🤖 AI', word: aiWord, seq: currentSeq });
            if (logs.length > 5) logs.splice(0, logs.length - 5);

            currentSeq = getRandomSequence(dictionary, Math.random() < 0.5 ? 2 : 3);
            turn = 'user';

            await updateGameMessage();
            // Small delay before next turn to prevent rapid-fire turns
            setTimeout(() => nextTurn(), 1000);
          }
        };

        msgCollector.on('collect', async msg => {
          if (turn !== 'user' || msg.author.id !== interaction.user.id || !isGameActive) return;
          
          // Clear timeout immediately to prevent race conditions
          clearTimeout(timeout);
          
          try {
            await msg.delete();
          } catch (err) {
            console.error('Failed to delete user message:', err.message);
          }

          const content = msg.content.toLowerCase().trim();

          if (!dictionary.has(content)) {
            logs.push({ player: '❌ Invalid', word: content, seq: currentSeq });
            if (logs.length > 5) logs.splice(0, logs.length - 5);
            await updateGameMessage();
            
            // Reset timeout for same turn
            timeout = setTimeout(async () => {
              if (!isGameActive) return;
              userLives--;
              logs.push({ player: '❌ Timeout', word: '—', seq: currentSeq });
              if (logs.length > 5) logs.splice(0, logs.length - 5);
              await updateGameMessage();
              if (userLives <= 0) {
                await endGame('💀 You lost! No lives left after timeout.');
                return;
              }
              turn = 'ai';
              await nextTurn();
            }, turnTime * 1000);
            return;
          }

          if (!content.includes(currentSeq)) {
            logs.push({ player: '❌ No sequence', word: content, seq: currentSeq });
            if (logs.length > 5) logs.splice(0, logs.length - 5);
            await updateGameMessage();
            
            // Reset timeout for same turn
            timeout = setTimeout(async () => {
              if (!isGameActive) return;
              userLives--;
              logs.push({ player: '❌ Timeout', word: '—', seq: currentSeq });
              if (logs.length > 5) logs.splice(0, logs.length - 5);
              await updateGameMessage();
              if (userLives <= 0) {
                await endGame('💀 You lost! No lives left after timeout.');
                return;
              }
              turn = 'ai';
              await nextTurn();
            }, turnTime * 1000);
            return;
          }

          if (usedWords.has(content)) {
            logs.push({ player: '❌ Used word', word: content, seq: currentSeq });
            if (logs.length > 5) logs.splice(0, logs.length - 5);
            await updateGameMessage();
            
            // Reset timeout for same turn
            timeout = setTimeout(async () => {
              if (!isGameActive) return;
              userLives--;
              logs.push({ player: '❌ Timeout', word: '—', seq: currentSeq });
              if (logs.length > 5) logs.splice(0, logs.length - 5);
              await updateGameMessage();
              if (userLives <= 0) {
                await endGame('💀 You lost! No lives left after timeout.');
                return;
              }
              turn = 'ai';
              await nextTurn();
            }, turnTime * 1000);
            return;
          }

          // Valid word played by user
          usedWords.add(content);

          // Track used letters for bonus life
          for (const char of content) {
            if (/[a-v]/.test(char)) {
              usedLetters.add(char);
            }
          }

          logs.push({ player: '🧑 You', word: content, seq: currentSeq });
          if (logs.length > 5) logs.splice(0, logs.length - 5);

          // Check bonus life if user used all letters a-v
          if (usedLetters.size === 22) {
            userLives++;
            usedLetters.clear();
            logs.push({ player: '🎉 Bonus', word: 'All letters used! +1 life', seq: '' });
            if (logs.length > 5) logs.splice(0, logs.length - 5);
          }

          // New sequence for AI turn
          currentSeq = getRandomSequence(dictionary, Math.random() < 0.5 ? 2 : 3);

          // Switch turn to AI
          turn = 'ai';

          await updateGameMessage();
          await nextTurn(); // AI turn
        });

        btnCollector.on('collect', async btn => {
          if (btn.user.id !== interaction.user.id) {
            return btn.reply({ content: 'Only the game creator can control this.', ephemeral: true });
          }
          
          if (!btn.isRepliable()) {
            console.log('Stop button interaction is no longer repliable');
            return;
          }
          
          if (btn.customId === 'stop_game') {
            try {
              await btn.deferUpdate();
              await endGame('🛑 Game stopped by user.');
            } catch (err) {
              console.error('Error handling stop button:', err.message);
            }
          }
        });

        // Handle collector end events
        msgCollector.on('end', (collected, reason) => {
          if (reason === 'time' && isGameActive) {
            endGame('⏰ Game ended due to timeout.');
          }
        });

        btnCollector.on('end', (collected, reason) => {
          if (reason === 'time' && isGameActive) {
            endGame('⏰ Game ended due to timeout.');
          }
        });

        // Start first turn (user)
        await nextTurn();

        startCollector.stop();
      }
    });

    startCollector.on('end', collected => {
      if (collected.size === 0) {
        interaction.editReply({ 
          content: '⏰ Game start timed out.', 
          embeds: [], 
          components: [] 
        }).catch(err => {
          console.error('Failed to edit reply on timeout:', err.message);
        });
      }
    });
  },

  // Export activeGames for potential use by other commands
  activeGames: activeGames
};