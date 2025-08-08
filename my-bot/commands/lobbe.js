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
 */
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
                    lobby.gameData.usedWords = new Set(lobby.gameData.usedWords || []);
                    
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
                    // Also ensure it's converted to a Set whether it's an array or already a Set
                    if (Array.isArray(lobby.gameData.dictionary)) {
                        lobby.gameData.dictionary = new Set(lobby.gameData.dictionary);
                    } else if (!(lobby.gameData.dictionary instanceof Set)) {
                        lobby.gameData.dictionary = new Set();
                    }
                }</old_str>
            }
        }
        lobbies = parsedLobbies;
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
            const newLobby = { ...lobby
            };

            // Convert Sets to arrays for saving
            if (newLobby.gameData) {
                if (newLobby.gameData.usedWords) {
                    newLobby.gameData.usedWords = Array.from(newLobby.gameData.usedWords);
                }
                if (newLobby.gameData.dictionary) {
                    newLobby.gameData.dictionary = Array.from(newLobby.gameData.dictionary);
                }

                // Check if usedLetters is a Map before trying to use .entries()
                if (newLobby.gameData.usedLetters instanceof Map) {
                    const usedLettersObject = {};
                    for (const [userId, letterSet] of newLobby.gameData.usedLetters.entries()) {
                        usedLettersObject[userId] = Array.from(letterSet);
                    }
                    newLobby.gameData.usedLetters = usedLettersObject;
                }
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

function getRandomSequence(dictionary, length = 2) {
    const words = Array.from(dictionary).filter(w => w.length >= length);
    if (words.length === 0) return '';
    while (true) {
        const word = words[Math.floor(Math.random() * words.length)];
        const start = Math.floor(Math.random() * (word.length - length + 1));
        const seq = word.substring(start, start + length);
        if ([...dictionary].some(w => w.includes(seq))) return seq;
    }
}

function formatLetters(usedLettersSet) {
    const all = 'abcdefghijklmnopqrstuv'.split('');
    return all.map(letter => usedLettersSet.has(letter) ? `🔴${letter}` : `🔵${letter}`).join(' ');
}

/**
 * Creates the game embed, with defensive checks for all properties.
 * This prevents crashes when the game is not active or data is missing.
 */
function createGameEmbed(lobby, currentPlayerId) {
    // This check is the most important for handling the initial lobby state
    if (!lobby || !lobby.gameData) {
        return new EmbedBuilder()
            .setTitle(`🎯 Lobby - ${lobby.gameId}`)
            .setDescription('Game is not yet started or has ended.')
            .setColor('Blue');
    }
    
    // Now we defensively check each property as we access it to avoid future errors.
    const livesData = lobby.gameData.lives || {};
    const playersLives = Object.entries(livesData).map(([id, lives]) => `<@${id}>: ${'❤️'.repeat(lives || 0)}`).join('\n') || 'No players.';
    
    const logs = lobby.gameData.logs || [];
    
    const gameStartTime = lobby.gameData.gameStartTime || Date.now();
    const elapsedSeconds = Math.floor((Date.now() - gameStartTime) / 1000);
    
    const usedWords = lobby.gameData.usedWords || new Set();
    const wordsPlayedCount = usedWords.size || 0;
    
    // Check if usedLetters is a Map before trying to get a value from it
    const currentPlayerLetters = (lobby.gameData.usedLetters instanceof Map) ? (lobby.gameData.usedLetters.get(currentPlayerId) || new Set()) : new Set();
    
    const currentSeq = lobby.gameData.currentSeq || 'Loading...';

    return new EmbedBuilder()
        .setTitle(`💣 BombParty - Lobby ${lobby.gameId}`)
        .setDescription(`**Current Sequence:** \`${currentSeq}\``)
        .addFields(
            { name: 'Players & Lives', value: playersLives, inline: true },
            { name: '⏳ Elapsed Time', value: `${elapsedSeconds}s`, inline: true },
            { name: '🔢 Words Played', value: wordsPlayedCount.toString(), inline: true },
            { name: '📜 Last 5 Events', value: logs.length > 0 ? logs.map(e => `• **${e.player === 'System' ? e.player : `<@${e.player}>`}**: \`${e.word}\` (${e.seq})`).join('\n') : 'None yet', inline: false },
            { name: `🔠 Used Letters (<@${currentPlayerId}>)`, value: formatLetters(currentPlayerLetters), inline: false }
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
                    currentSeq: getRandomSequence(dictionary, Math.random() < 0.5 ? 2 : 3),
                    currentPlayerIndex: 0,
                    gameStartTime: Date.now(),
                    timeout: null,
                    isGameActive: true,
                };
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
                    saveLobbies();

                    await interaction.editReply({
                        content: reason,
                        embeds: [createGameEmbed(currentLobby, playersInGame[currentLobby.gameData.currentPlayerIndex])],
                        components: [],
                    }).catch(() => {});

                    delete lobbies[guildId][gameId];
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
                            word: '—',
                            seq: currentLobby.gameData.currentSeq
                        });
                        if (currentLobby.gameData.logs.length > 5) currentLobby.gameData.logs.splice(0, currentLobby.gameData.logs.length - 5);
                        saveLobbies();

                        if (Object.values(currentLobby.gameData.lives).filter(lives => lives > 0).length <= 1) {
                            await endGame(`🎉 Game over! The winner is <@${Object.keys(currentLobby.gameData.lives).find(id => currentLobby.gameData.lives[id] > 0)}>`);
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

                        // Ensure dictionary is a Set
                        if (!(updatedLobby.gameData.dictionary instanceof Set)) {
                            updatedLobby.gameData.dictionary = new Set(updatedLobby.gameData.dictionary || []);
                        }

                        // Ensure usedWords is a Set
                        if (!(updatedLobby.gameData.usedWords instanceof Set)) {
                            updatedLobby.gameData.usedWords = new Set(updatedLobby.gameData.usedWords || []);
                        }

                        const isValidWord = updatedLobby.gameData.dictionary.has(content);
                        const containsSequence = content.includes(updatedLobby.gameData.currentSeq);
                        const isWordUsed = updatedLobby.gameData.usedWords.has(content);</old_str>

                        if (isValidWord && containsSequence && !isWordUsed) {
                            msgCollector.stop();

                            updatedLobby.gameData.usedWords.add(content);

                            // Get the current player's personal used letters set
                            const playerUsedLetters = updatedLobby.gameData.usedLetters.get(currentPlayerId);
                            // Add each letter of the played word to their personal set
                            content.split('').forEach(letter => playerUsedLetters.add(letter));

                            updatedLobby.gameData.logs.push({
                                player: currentPlayerId,
                                word: content,
                                seq: updatedLobby.gameData.currentSeq
                            });
                       if (updatedLobby.gameData.logs.length > 5) updatedLobby.gameData.logs.splice(0, updatedLobby.gameData.logs.length - 5);

                            // Check if this player has now completed their alphabet
                            if (playerUsedLetters.size >= 22) {
                                updatedLobby.gameData.lives[currentPlayerId]++;
                                updatedLobby.gameData.logs.push({
                                    player: 'System',
                                    word: '—',
                                    seq: '—'
                                });
                                updatedLobby.gameData.logs.push({
                                    player: 'System',
                                    word: `<@${currentPlayerId}> completed their alphabet and earned an extra life!`,
                                    seq: '—'
                                });
                                // Reset the player's alphabet to start over
                                updatedLobby.gameData.usedLetters.set(currentPlayerId, new Set());
                            }

                            updatedLobby.gameData.currentSeq = getRandomSequence(updatedLobby.gameData.dictionary, Math.random() < 0.5 ? 2 : 3);
                            updatedLobby.gameData.currentPlayerIndex = (updatedLobby.gameData.currentPlayerIndex + 1) % playersInGame.length;
                            while (updatedLobby.gameData.lives[playersInGame[updatedLobby.gameData.currentPlayerIndex]] <= 0) {
                                updatedLobby.gameData.currentPlayerIndex = (updatedLobby.gameData.currentPlayerIndex + 1) % playersInGame.length;
                            }

                            saveLobbies();
                            await nextTurn();
                        } else {
                            await interaction.followUp({
                                content: `❌ Invalid word. Try again.`,
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