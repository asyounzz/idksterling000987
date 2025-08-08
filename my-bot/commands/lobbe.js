const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    UserSelectMenuBuilder,
    ComponentType,
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const lobbiesPath = path.join(__dirname, '..', 'lobbies.json');
let lobbies = {};

/**
 * Loads lobbies from the JSON file, converting arrays back to Sets and Maps.
 * Includes defensive checks to prevent crashes if game data properties are missing.
 */
function loadLobbies() {
    if (fs.existsSync(lobbiesPath)) {
        const rawData = fs.readFileSync(lobbiesPath, 'utf8');
        const parsedLobbies = JSON.parse(rawData);

        for (const guildId in parsedLobbies) {
            for (const gameId in parsedLobbies[guildId]) {
                const lobby = parsedLobbies[guildId][gameId];
                if (lobby.gameData) {
                    // Defensive check: if usedWords is not present, default to an empty array.
                    // Handle both Set and Array formats
                    const usedWordsData = lobby.gameData.usedWords || [];
                    lobby.gameData.usedWords = new Set(Array.isArray(usedWordsData) ? usedWordsData : []);
                    
                    const usedLettersMap = new Map();
                    // Defensive check: if usedLetters is not an object, default to an empty one.
                    if (lobby.gameData.usedLetters) {
                        for (const userId in lobby.gameData.usedLetters) {
                            // Defensive check: if a user's letters are not an array, default to an empty one.
                            usedLettersMap.set(userId, new Set(lobby.gameData.usedLetters[userId] || []));
                        }
                    }
                    lobby.gameData.usedLetters = usedLettersMap;
                    // Defensive check: if dictionary is not present, default to an empty array.
                    lobby.gameData.dictionary = new Set(lobby.gameData.dictionary || []);
                    // Defensive check for sequenceHistory
                    lobby.gameData.sequenceHistory = lobby.gameData.sequenceHistory || [];
                }
            }
        }
        lobbies = parsedLobbies;
        console.log(`📂 Loaded ${Object.keys(lobbies).length} guild(s) with games from JSON`);
    } else {
        console.log(`📂 No existing games.json file found, starting fresh`);
    }
}
loadLobbies();

/**
 * Saves lobbies to the JSON file, converting Sets to arrays for serialization.
 */
function saveLobbies() {
    const lobbiesToSave = {};
    for (const guildId in lobbies) {
        lobbiesToSave[guildId] = {};
        for (const gameId in lobbies[guildId]) {
            const lobby = lobbies[guildId][gameId];
            const newLobby = { ...lobby };

            if (newLobby.gameData) {
                if (newLobby.gameData.usedWords) {
                    newLobby.gameData.usedWords = Array.from(newLobby.gameData.usedWords);
                }
                if (newLobby.gameData.dictionary) {
                    newLobby.gameData.dictionary = Array.from(newLobby.gameData.dictionary);
                }

                if (newLobby.gameData.usedLetters instanceof Map) {
                    const usedLettersObject = {};
                    for (const [userId, letterSet] of newLobby.gameData.usedLetters.entries()) {
                        usedLettersObject[userId] = Array.from(letterSet);
                    }
                    newLobby.gameData.usedLetters = usedLettersObject;
                }
                
                // Debug logging to confirm data is being saved
                console.log(`💾 Saving game ${gameId} - Words: ${newLobby.gameData.usedWords?.length || 0}, Logs: ${newLobby.gameData.logs?.length || 0}`);
            }
            lobbiesToSave[guildId][gameId] = newLobby;
        }
    }
    fs.writeFileSync(lobbiesPath, JSON.stringify(lobbiesToSave, null, 2));
}

function generateGameId() {
    return Math.random().toString(36).substring(2, 12);
}

function loadDictionary(language) {
    const filePath = path.join(__dirname, 'dics', `${language}.txt`);
    if (!fs.existsSync(filePath)) {
        console.error(`Dictionary file not found for language: ${language}`);
        return new Set();
    }
    const words = fs.readFileSync(filePath, 'utf-8')
        .split(/\r?\n/)
        .map(w => w.trim().toLowerCase())
        .filter(Boolean);
    return new Set(words);
}

/**
 * Generates a random sequence, ensuring it's not in the avoidSequences list.
 * @param {Set<string>} dictionary The dictionary of words.
 * @param {number} length The desired length of the sequence.
 * @param {string[]} [avoidSequences=[]] An array of sequences to avoid.
 * @returns {string} The generated sequence.
 */
function getRandomSequence(dictionary, length = 2, avoidSequences = []) {
    const words = Array.from(dictionary).filter(w => w.length >= length);
    if (words.length === 0) return '';
    
    let attempts = 0;
    const maxAttempts = 100;
    
    while (attempts < maxAttempts) {
        const word = words[Math.floor(Math.random() * words.length)];
        const start = Math.floor(Math.random() * (word.length - length + 1));
        const seq = word.substring(start, start + length);
        
        // Check if sequence exists in dictionary and isn't in avoid list
        if ([...dictionary].some(w => w.includes(seq)) && !avoidSequences.includes(seq)) {
            return seq;
        }
        attempts++;
    }
    
    // Fallback: if we can't avoid the sequences, just return any valid one
    while (true) {
        const word = words[Math.floor(Math.random() * words.length)];
        const start = Math.floor(Math.random() * (word.length - length + 1));
        const seq = word.substring(start, start + length);
        if ([...dictionary].some(w => w.includes(seq))) return seq;
    }
}

/**
 * Formats the letters for the embed field, showing red for used letters.
 * @param {Set<string>} usedLettersSet The set of letters the player has used.
 * @returns {string} A string of emojis and letters.
 */
function formatLetters(usedLettersSet) {
    const all = 'abcdefghijklmnopqrstuv'.split('');
    const letterSet = usedLettersSet instanceof Set ? usedLettersSet : new Set();
    return all.map(letter => letterSet.has(letter) ? `🔴${letter}` : `🔵${letter}`).join(' ');
}

/**
 * Creates the game embed with all the game data.
 * @param {object} lobby The current lobby object.
 * @param {string} currentPlayerId The ID of the current player.
 * @returns {EmbedBuilder} The formatted game embed.
 */
function createGameEmbed(lobby, currentPlayerId) {
    if (!lobby || !lobby.gameData) {
        return new EmbedBuilder()
            .setTitle(`🎯 Lobby - ${lobby?.gameId || 'Unknown'}`)
            .setDescription('Game is not yet started or has ended.')
            .setColor('Blue');
    }
    
    const livesData = lobby.gameData.lives || {};
    const playersLives = Object.entries(livesData).map(([id, lives]) => `<@${id}>: ${'❤️'.repeat(lives || 0)}`).join('\n') || 'No players.';
    
    const logs = lobby.gameData.logs || [];
    
    const gameStartTime = lobby.gameData.gameStartTime || Date.now();
    const elapsedSeconds = Math.floor((Date.now() - gameStartTime) / 1000);
    
    // Fix words played count
    const usedWords = lobby.gameData.usedWords || new Set();
    const wordsPlayedCount = usedWords instanceof Set ? usedWords.size : (Array.isArray(usedWords) ? usedWords.length : 0);
    
    // Get current player's used letters for display
    const currentPlayerLetters = (lobby.gameData.usedLetters instanceof Map) ? 
        (lobby.gameData.usedLetters.get(currentPlayerId) || new Set()) : new Set();
    
    const currentSeq = lobby.gameData.currentSeq || 'Loading...';

    return new EmbedBuilder()
        .setTitle(`💣 BombParty - Lobby ${lobby.gameId || 'Unknown'}`)
        .setDescription(`**Current Sequence:** \`${currentSeq}\``)
        .addFields(
            { name: 'Players & Lives', value: playersLives, inline: true },
            { name: '⏳ Elapsed Time', value: `${elapsedSeconds}s`, inline: true },
            { name: '🔢 Words Played', value: wordsPlayedCount.toString(), inline: true },
            { name: '📜 Last 5 Events', value: logs.length > 0 ? logs.slice(-5).map(e => `• **${e.player === 'System' ? e.player : `<@${e.player}>`}**: \`${e.word}\` (${e.seq})`).join('\n') : 'None yet', inline: false },
            { name: `🔠 Used Letters (<@${currentPlayerId || 'Unknown'}>)`, value: formatLetters(currentPlayerLetters), inline: false }
        )
        .setFooter({ text: '🔥 Use every letter of the alphabet above to earn an extra life!' })
        .setColor(0xffcc00);
}

function generateLobbyEmbed(lobby) {
    return new EmbedBuilder()
        .setTitle(`🎯 Lobby - ${lobby.gameId}`)
        .setDescription(`**Owner:** <@${lobby.owner}>`)
        .addFields(
            { name: 'Players', value: lobby.players.length > 0 ? lobby.players.map(id => `<@${id}>`).join('\n') : 'No players yet', inline: true },
            { name: 'Max Players', value: `${lobby.maxPlayers}`, inline: true },
            { name: 'Language', value: lobby.settings.language, inline: true },
            { name: 'Lives', value: `${lobby.settings.lives}`, inline: true },
            { name: 'Turn Time', value: `${lobby.settings.turnTime}s`, inline: true }
        )
        .setColor('Blue');
}

function lobbyComponents() {
    const settingsMenu = new StringSelectMenuBuilder()
        .setCustomId('settings_menu')
        .setPlaceholder('⚙️ Game Settings')
        .addOptions([
            new StringSelectMenuOptionBuilder().setLabel('Language: English').setValue('english'),
            new StringSelectMenuOptionBuilder().setLabel('Language: French').setValue('french'),
            new StringSelectMenuOptionBuilder().setLabel('Lives: 3').setValue('lives_3'),
            new StringSelectMenuOptionBuilder().setLabel('Lives: 5').setValue('lives_5'),
            new StringSelectMenuOptionBuilder().setLabel('Turn Time: 10s').setValue('time_10'),
            new StringSelectMenuOptionBuilder().setLabel('Turn Time: 15s').setValue('time_15')
        ]);

    const row1 = new ActionRowBuilder().addComponents(settingsMenu);

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('join_game').setLabel('Join Game').setStyle(ButtonStyle.Success).setEmoji('➕'),
        new ButtonBuilder().setCustomId('leave_game').setLabel('Leave Game').setStyle(ButtonStyle.Secondary).setEmoji('🏃‍♂️'),
        new ButtonBuilder().setCustomId('start_game').setLabel('Start Game').setStyle(ButtonStyle.Primary).setEmoji('🚀'),
        new ButtonBuilder().setCustomId('transfer_owner').setLabel('Transfer Ownership').setStyle(ButtonStyle.Secondary).setEmoji('👑'),
        new ButtonBuilder().setCustomId('ban_player').setLabel('Ban Player').setStyle(ButtonStyle.Danger).setEmoji('⛔')
    );

    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cancel_room').setLabel('Cancel Room').setStyle(ButtonStyle.Danger).setEmoji('🗑️')
    );

    return [row1, row2, row3];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lobby')
        .setDescription('Create a multiplayer lobby')
        .addIntegerOption(option =>
            option.setName('max_players')
            .setDescription('Number of players (2-6)')
            .setRequired(true)
            .setMinValue(2)
            .setMaxValue(6)
        ),
    async execute(interaction) {
        const maxPlayers = interaction.options.getInteger('max_players');
        const guildId = interaction.guild.id;
        const channelId = interaction.channel.id;
        if (!lobbies[guildId]) lobbies[guildId] = {};

        const gameId = generateGameId();
        lobbies[guildId][gameId] = {
            gameId,
            channelId,
            owner: interaction.user.id,
            players: [interaction.user.id],
            banned: [],
            maxPlayers,
            settings: {
                language: 'english',
                lives: 3,
                turnTime: 10
            },
            lastActivity: Date.now(),
            gameData: null,
            gameMessageId: null,
        };
        saveLobbies();

        await interaction.reply({
            embeds: [generateLobbyEmbed(lobbies[guildId][gameId])],
            components: lobbyComponents()
        });

        const message = await interaction.fetchReply();
        lobbies[guildId][gameId].gameMessageId = message.id;
        saveLobbies();

        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 120000
        });

        collector.on('collect', async i => {
            const lobby = lobbies[guildId][gameId];
            if (!lobby) return i.reply({
                content: '❌ This lobby no longer exists.',
                ephemeral: true
            });

            lobby.lastActivity = Date.now();

            if (i.customId === 'join_game') {
                if (lobby.players.includes(i.user.id)) return i.reply({
                    content: '❌ You are already in the game.',
                    ephemeral: true
                });
                if (lobby.players.length >= lobby.maxPlayers) return i.reply({
                    content: '❌ Lobby is full.',
                });
                if (lobby.banned.includes(i.user.id)) return i.reply({
                    content: '❌ You are banned from this lobby.',
                    ephemeral: true
                });

                lobby.players.push(i.user.id);
                saveLobbies();
                await i.deferUpdate();
                await interaction.editReply({
                    embeds: [generateLobbyEmbed(lobby)],
                    components: lobbyComponents()
                });
                return;
            }

            if (i.customId === 'leave_game') {
                if (!lobby.players.includes(i.user.id)) return i.reply({
                    content: '❌ You are not in the game.',
                    ephemeral: true
                });
                if (lobby.owner === i.user.id) return i.reply({
                    content: '❌ The owner cannot leave. Use Cancel Room instead.',
                    ephemeral: true
                });

                lobby.players = lobby.players.filter(p => p !== i.user.id);
                saveLobbies();
                await i.deferUpdate();
                await interaction.editReply({
                    embeds: [generateLobbyEmbed(lobby)],
                    components: lobbyComponents()
                });
                return;
            }

            if (i.customId === 'transfer_owner') {
                if (i.user.id !== lobby.owner) return i.reply({
                    content: '❌ Only the owner can transfer ownership.',
                    ephemeral: true
                });
                if (lobby.players.length < 2) return i.reply({
                    content: '❌ No other players to transfer ownership to.',
                    ephemeral: true
                });

                const userMenu = new UserSelectMenuBuilder()
                    .setCustomId('select_new_owner')
                    .setPlaceholder('Select a new owner')
                    .setMaxValues(1)
                    .setMinValues(1);

                const row = new ActionRowBuilder().addComponents(userMenu);

                await i.deferUpdate();

                const followUpMessage = await i.followUp({
                    content: '👑 Select a player to become the new owner:',
                    components: [row],
                    ephemeral: true
                });

                const newOwnerCollector = followUpMessage.createMessageComponentCollector({
                    componentType: ComponentType.UserSelect,
                    time: 60000,
                    filter: (interaction) => interaction.user.id === i.user.id,
                    max: 1
                });

                newOwnerCollector.on('collect', async menuInteraction => {
                    const newOwnerId = menuInteraction.values[0];
                    const updatedLobby = lobbies[guildId][gameId];

                    if (!updatedLobby || !updatedLobby.players.includes(newOwnerId)) {
                        return menuInteraction.update({
                            content: '❌ Selected user is not in the lobby or lobby no longer exists.',
                            components: []
                        });
                    }

                    updatedLobby.owner = newOwnerId;
                    saveLobbies();

                    await menuInteraction.update({
                        content: `✅ Ownership transferred to <@${newOwnerId}>`,
                        components: []
                    });

                    await interaction.editReply({
                        embeds: [generateLobbyEmbed(updatedLobby)],
                        components: lobbyComponents(),
                    });
                });

                newOwnerCollector.on('end', (collected, reason) => {
                    if (reason === 'time') {
                        i.editReply({
                            content: '❌ Transfer ownership timed out.',
                            components: []
                        });
                    }
                });

                return;
            }

            if (i.customId === 'ban_player') {
                if (i.user.id !== lobby.owner) return i.reply({
                    content: '❌ Only the owner can ban players.',
                    ephemeral: true
                });
                if (lobby.players.length < 2) return i.reply({
                    content: '❌ No players to ban.',
                    ephemeral: true
                });

                const userMenu = new UserSelectMenuBuilder()
                    .setCustomId('select_ban_player')
                    .setPlaceholder('Select a player to ban')
                    .setMaxValues(1)
                    .setMinValues(1);

                const row = new ActionRowBuilder().addComponents(userMenu);

                await i.deferUpdate();

                const followUpMessage = await i.followUp({
                    content: '⛔ Select a player to ban:',
                    components: [row],
                    ephemeral: true
                });

                const banPlayerCollector = followUpMessage.createMessageComponentCollector({
                    componentType: ComponentType.UserSelect,
                    time: 60000,
                    filter: (interaction) => interaction.user.id === i.user.id,
                    max: 1
                });

                banPlayerCollector.on('collect', async menuInteraction => {
                    const banUserId = menuInteraction.values[0];
                    const updatedLobby = lobbies[guildId][gameId];

                    if (!updatedLobby || !updatedLobby.players.includes(banUserId)) {
                        return menuInteraction.update({
                            content: '❌ Selected user is not in the lobby or lobby no longer exists.',
                            components: []
                        });
                    }

                    if (banUserId === updatedLobby.owner) {
                        return menuInteraction.update({
                            content: '❌ You cannot ban the owner.',
                            components: []
                        });
                    }

                    updatedLobby.players = updatedLobby.players.filter(id => id !== banUserId);
                    updatedLobby.banned.push(banUserId);
                    saveLobbies();

                    await menuInteraction.update({
                        content: `⛔ <@${banUserId}> has been banned and removed from the lobby.`,
                        components: []
                    });

                    await interaction.editReply({
                        embeds: [generateLobbyEmbed(updatedLobby)],
                        components: lobbyComponents(),
                    });
                });

                banPlayerCollector.on('end', (collected, reason) => {
                    if (reason === 'time') {
                        i.editReply({
                            content: '❌ Ban player selection timed out.',
                            components: []
                        });
                    }
                });
                return;
            }

            if (i.customId === 'start_game') {
                if (i.user.id !== lobby.owner) return i.reply({
                    content: '❌ Only the owner can start the game.',
                    ephemeral: true
                });
                if (lobby.players.length < 2) return i.reply({
                    content: '❌ At least 2 players needed to start the game.',
                    ephemeral: true
                });

                await i.deferUpdate();

                const dictionary = loadDictionary(lobby.settings.language);
                const playersInGame = [...lobby.players];
                const initialLives = {};
                const initialUsedLetters = new Map();
                playersInGame.forEach(id => {
                    initialLives[id] = lobby.settings.lives;
                    initialUsedLetters.set(id, new Set());
                });

                const currentLobby = lobbies[guildId][gameId];
                currentLobby.gameData = {
                    dictionary: dictionary,
                    usedWords: new Set(),
                    usedLetters: initialUsedLetters,
                    logs: [],
                    lives: initialLives,
                    // Store a history of sequences to avoid repetition
                    sequenceHistory: [],
                    currentSeq: '', // Will be set on the first turn
                    currentPlayerIndex: 0,
                    gameStartTime: Date.now(),
                    timeout: null,
                    isGameActive: true,
                };
                
                // Get the first sequence and add it to the history
                const firstSeq = getRandomSequence(dictionary, Math.random() < 0.5 ? 2 : 3);
                currentLobby.gameData.currentSeq = firstSeq;
                currentLobby.gameData.sequenceHistory.push(firstSeq);

                saveLobbies();

                collector.stop('started');

                const stopRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('stop_game').setLabel('Stop Game').setStyle(ButtonStyle.Danger).setEmoji('🛑')
                );

                const gameMessage = await interaction.editReply({
                    content: `🎮 Game started! First turn: <@${playersInGame[0]}>. You have **${lobby.settings.turnTime}s** to type a word containing: \`${currentLobby.gameData.currentSeq}\``,
                    embeds: [createGameEmbed(currentLobby, playersInGame[0])],
                    components: [stopRow],
                });

                async function updateGameMessage() {
                    const updatedLobby = lobbies[guildId][gameId];
                    if (!updatedLobby || !updatedLobby.gameData || !updatedLobby.gameData.isGameActive) return;

                    const currentPlayerId = playersInGame[updatedLobby.gameData.currentPlayerIndex];
                    const turnMessage = `⏳ Your turn, <@${currentPlayerId}>! You have **${updatedLobby.settings.turnTime}s** to type a word containing: \`${updatedLobby.gameData.currentSeq}\``;

                    try {
                        await gameMessage.edit({
                            content: turnMessage,
                            embeds: [createGameEmbed(updatedLobby, currentPlayerId)],
                            components: [stopRow],
                        });
                    } catch (err) {
                        console.error('Failed to update game message:', err);
                    }
                }

                const endGame = async (reason) => {
                    const currentLobby = lobbies[guildId][gameId];
                    if (!currentLobby || !currentLobby.gameData) return;

                    clearTimeout(currentLobby.gameData.timeout);
                    currentLobby.gameData.isGameActive = false;

                    await interaction.editReply({
                        content: reason,
                        embeds: [createGameEmbed(currentLobby, playersInGame[currentLobby.gameData.currentPlayerIndex])],
                        components: [],
                    }).catch(() => {});

                    // Clean up the game from memory and JSON file
                    delete lobbies[guildId][gameId];
                    // If no games left in this guild, remove the guild entry
                    if (Object.keys(lobbies[guildId] || {}).length === 0) {
                        delete lobbies[guildId];
                    }
                    saveLobbies();
                };

                const nextTurn = async () => {
                    const currentLobby = lobbies[guildId][gameId];
                    if (!currentLobby || !currentLobby.gameData || !currentLobby.gameData.isGameActive) return;

                    clearTimeout(currentLobby.gameData.timeout);
                    await updateGameMessage();

                    const currentPlayerId = playersInGame[currentLobby.gameData.currentPlayerIndex];
                    
                    const msgCollector = interaction.channel.createMessageCollector({
                        filter: m => m.author.id === currentPlayerId,
                        time: currentLobby.settings.turnTime * 1000
                    });

                    currentLobby.gameData.timeout = setTimeout(async () => {
                        msgCollector.stop('timeout');
                        currentLobby.gameData.lives[currentPlayerId]--;
                        currentLobby.gameData.logs.push({
                            player: currentPlayerId,
                            word: '❌ Timeout',
                            seq: currentLobby.gameData.currentSeq
                        });
                        if (currentLobby.gameData.logs.length > 5) currentLobby.gameData.logs.splice(0, currentLobby.gameData.logs.length - 5);
                        
                        // --- FIX: Change sequence on timeout failure ---
                        // Get last two sequences to avoid repetition
                        const avoidSequences = currentLobby.gameData.sequenceHistory.slice(-2);
                        currentLobby.gameData.currentSeq = getRandomSequence(
                            currentLobby.gameData.dictionary,
                            Math.random() < 0.5 ? 2 : 3,
                            avoidSequences
                        );
                        currentLobby.gameData.sequenceHistory.push(currentLobby.gameData.currentSeq);
                        // Keep history to a max of 3 sequences
                        if (currentLobby.gameData.sequenceHistory.length > 3) {
                            currentLobby.gameData.sequenceHistory.shift();
                        }
                        // ----------------------------------------------

                        currentLobby.gameData.timeout = null;
                        
                        // Save the game state after timeout
                        saveLobbies();

                        if (Object.values(currentLobby.gameData.lives).filter(lives => lives > 0).length <= 1) {
                            const winner = Object.keys(currentLobby.gameData.lives).find(id => currentLobby.gameData.lives[id] > 0);
                            await endGame(`🎉 Game over! The winner is <@${winner}>`);
                            return;
                        }

                        currentLobby.gameData.currentPlayerIndex = (currentLobby.gameData.currentPlayerIndex + 1) % playersInGame.length;
                        while (currentLobby.gameData.lives[playersInGame[currentLobby.gameData.currentPlayerIndex]] <= 0) {
                            currentLobby.gameData.currentPlayerIndex = (currentLobby.gameData.currentPlayerIndex + 1) % playersInGame.length;
                        }
                        await nextTurn();
                    }, currentLobby.settings.turnTime * 1000);

                    msgCollector.on('collect', async msg => {
                        const content = msg.content.toLowerCase().trim();
                        await msg.delete().catch(() => {});
                        const updatedLobby = lobbies[guildId][gameId];
                        if (!updatedLobby || !updatedLobby.gameData) return;

                        // Ensure dictionary and usedWords are Sets
                        if (!(updatedLobby.gameData.dictionary instanceof Set)) {
                            updatedLobby.gameData.dictionary = new Set(updatedLobby.gameData.dictionary || []);
                        }
                        if (!(updatedLobby.gameData.usedWords instanceof Set)) {
                            updatedLobby.gameData.usedWords = new Set(updatedLobby.gameData.usedWords || []);
                        }

                        const isValidWord = updatedLobby.gameData.dictionary.has(content);
                        const containsSequence = content.includes(updatedLobby.gameData.currentSeq);
                        const isWordUsed = updatedLobby.gameData.usedWords.has(content);

                        if (isValidWord && containsSequence && !isWordUsed) {
                            msgCollector.stop();
                            clearTimeout(updatedLobby.gameData.timeout);
                            updatedLobby.gameData.timeout = null;

                            // Add word to used words set
                            updatedLobby.gameData.usedWords.add(content);

                            // Ensure usedLetters is a Map
                            if (!(updatedLobby.gameData.usedLetters instanceof Map)) {
                                const usedLettersMap = new Map();
                                for (const userId in updatedLobby.gameData.usedLetters) {
                                    usedLettersMap.set(userId, new Set(updatedLobby.gameData.usedLetters[userId] || []));
                                }
                                updatedLobby.gameData.usedLetters = usedLettersMap;
                            }

                            // Get current player's used letters
                            let playerUsedLetters = updatedLobby.gameData.usedLetters.get(currentPlayerId);
                            if (!playerUsedLetters) {
                                playerUsedLetters = new Set();
                                updatedLobby.gameData.usedLetters.set(currentPlayerId, playerUsedLetters);
                            }
                            
                            // Track used letters for current player (a-v only, like bombparty.js)
                            for (const char of content) {
                                if (/[a-v]/.test(char)) {
                                    playerUsedLetters.add(char);
                                }
                            }

                            updatedLobby.gameData.logs.push({
                                player: currentPlayerId,
                                word: content,
                                seq: updatedLobby.gameData.currentSeq
                            });
                            if (updatedLobby.gameData.logs.length > 5) updatedLobby.gameData.logs.splice(0, updatedLobby.gameData.logs.length - 5);

                            // Check bonus life if player used all letters a-v (22 letters total)
                            if (playerUsedLetters.size === 22) {
                                updatedLobby.gameData.lives[currentPlayerId]++;
                                playerUsedLetters.clear();
                                updatedLobby.gameData.logs.push({
                                    player: 'System',
                                    word: `🎉 <@${currentPlayerId}> completed alphabet! +1 life`,
                                    seq: '—'
                                });
                                // Save immediately when bonus life is awarded
                                saveLobbies();
                            }

                            // Track sequence history to avoid repetition
                            updatedLobby.gameData.sequenceHistory.push(updatedLobby.gameData.currentSeq);
                            if (updatedLobby.gameData.sequenceHistory.length > 3) {
                                updatedLobby.gameData.sequenceHistory.shift();
                            }
                            
                            // Generate new sequence avoiding recent ones
                            const avoidSequences = updatedLobby.gameData.sequenceHistory.slice(-2);
                            updatedLobby.gameData.currentSeq = getRandomSequence(
                                updatedLobby.gameData.dictionary, 
                                Math.random() < 0.5 ? 2 : 3,
                                avoidSequences
                            );
                            updatedLobby.gameData.currentPlayerIndex = (updatedLobby.gameData.currentPlayerIndex + 1) % playersInGame.length;
                            while (updatedLobby.gameData.lives[playersInGame[updatedLobby.gameData.currentPlayerIndex]] <= 0) {
                                updatedLobby.gameData.currentPlayerIndex = (updatedLobby.gameData.currentPlayerIndex + 1) % playersInGame.length;
                            }

                            // Save the game state after each valid word
                            saveLobbies();
                            await nextTurn();
                        } else {
                            // Log the invalid attempt
                            let reason;
                            if (!isValidWord) {
                                reason = 'Invalid word';
                            } else if (!containsSequence) {
                                reason = 'Does not contain sequence';
                            } else if (isWordUsed) {
                                reason = 'Already used';
                            }
                            
                            await interaction.followUp({
                                content: `❌ Invalid word: **${content}**. Reason: ${reason}. Try again.`,
                                ephemeral: true
                            });
                        }
                    });
                };

                const btnCollector = gameMessage.createMessageComponentCollector({
                    componentType: ComponentType.Button,
                    time: 10 * 60 * 1000,
                });

                btnCollector.on('collect', async btn => {
                    if (btn.customId === 'stop_game') {
                        if (btn.user.id !== lobby.owner) {
                            return btn.reply({
                                content: '❌ Only the owner can stop the game.',
                                ephemeral: true
                            });
                        }
                        await btn.deferUpdate();
                        await endGame('🛑 Game stopped by user.');
                        btnCollector.stop('stopped');
                    }
                });

                await nextTurn();
            }

            if (i.customId === 'cancel_room') {
                if (i.user.id !== lobby.owner) return i.reply({
                    content: '❌ Only the owner can cancel the room.',
                    ephemeral: true
                });

                delete lobbies[guildId][gameId];
                saveLobbies();

                await i.deferUpdate();
                await interaction.editReply({
                    content: '🗑️ Lobby has been canceled.',
                    embeds: [],
                    components: []
                });
                collector.stop('canceled');
                return;
            }
        });

        const selectCollector = message.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: 120000
        });

        selectCollector.on('collect', async i => {
            const lobby = lobbies[guildId][gameId];
            if (!lobby) return i.reply({
                content: '❌ This lobby no longer exists.',
                ephemeral: true
            });

            lobby.lastActivity = Date.now();

            if (i.customId === 'settings_menu') {
                if (i.user.id !== lobby.owner) return i.reply({
                    content: '❌ Only the owner can change settings.',
                    ephemeral: true
                });
                
                const value = i.values[0];

                if (value === 'english' || value === 'french') {
                    lobby.settings.language = value;
                } else if (value.startsWith('lives_')) {
                    lobby.settings.lives = parseInt(value.split('_')[1]);
                } else if (value.startsWith('time_')) {
                    lobby.settings.turnTime = parseInt(value.split('_')[1]);
                }

                saveLobbies();
                await i.deferUpdate();
                await interaction.editReply({
                    embeds: [generateLobbyEmbed(lobby)],
                    components: lobbyComponents()
                });
                return;
            }
        });
    },
};
