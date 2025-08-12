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
                }
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
            const newLobby = { ...lobby };

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

                // Remove timeout object and other non-serializable properties
                delete newLobby.gameData.timeout;
                delete newLobby.gameData.processingTurn;
                delete newLobby.gameData.messageCollector;
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

function getRandomSequence(dictionary, length = 2, avoidSequences = []) {
    const words = Array.from(dictionary).filter(w => w.length >= length);
    if (words.length === 0) return '';
    
    let attempts = 0;
    const maxAttempts = 100; // Prevent infinite loops
    
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

    // Use the dedicated counter for words played
    const wordsPlayedCount = lobby.gameData.wordsPlayedCount || 0;

    // Ensure usedLetters is properly structured as a Map
    let currentPlayerLetters = new Set();
    if (lobby.gameData.usedLetters instanceof Map) {
        currentPlayerLetters = lobby.gameData.usedLetters.get(currentPlayerId) || new Set();
    } else if (lobby.gameData.usedLetters && typeof lobby.gameData.usedLetters === 'object') {
        // Convert from object format if needed
        const usedLettersMap = new Map();
        for (const userId in lobby.gameData.usedLetters) {
            usedLettersMap.set(userId, new Set(lobby.gameData.usedLetters[userId] || []));
        }
        lobby.gameData.usedLetters = usedLettersMap;
        currentPlayerLetters = usedLettersMap.get(currentPlayerId) || new Set();
    }

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
            new StringSelectMenuOptionBuilder().setLabel('Language: English').setValue('english').setEmoji('🇬🇧'),
            new StringSelectMenuOptionBuilder().setLabel('Language: French').setValue('french').setEmoji('🇲🇫'),
            new StringSelectMenuOptionBuilder().setLabel('Lives: 1').setValue('lives_1'),
            new StringSelectMenuOptionBuilder().setLabel('Lives: 3').setValue('lives_3'),
            new StringSelectMenuOptionBuilder().setLabel('Lives: 5').setValue('lives_5'),
            new StringSelectMenuOptionBuilder().setLabel('Turn Time: 10s').setValue('time_10'),
            new StringSelectMenuOptionBuilder().setLabel('Turn Time: 15s').setValue('time_15'),
            new StringSelectMenuOptionBuilder().setLabel('Turn Time: 20s').setValue('time_20')
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

/**
 * Safely clears any existing timeout for a lobby
 */
function clearLobbyTimeout(lobby) {
    if (lobby.gameData && lobby.gameData.timeout) {
        clearTimeout(lobby.gameData.timeout);
        lobby.gameData.timeout = null;
    }
}

/**
 * Safely stops any existing message collector for a lobby
 */
function stopMessageCollector(lobby) {
    if (lobby.gameData && lobby.gameData.messageCollector) {
        try {
            lobby.gameData.messageCollector.stop('manual_stop');
        } catch (err) {
            // Collector might already be stopped
        }
        lobby.gameData.messageCollector = null;
    }
}

/**
 * Creates and manages a timeout for a player's turn (Enhanced with better race condition handling)
 */
function setPlayerTimeout(lobby, interaction, playersInGame, endGameCallback, nextTurnCallback) {
    // Clear any existing timeout first
    clearLobbyTimeout(lobby);
    
    const currentPlayerId = playersInGame[lobby.gameData.currentPlayerIndex];
    
    lobby.gameData.timeout = setTimeout(async () => {
        try {
            // Prevent race conditions - check if already processing or game ended
            if (lobby.gameData.processingTurn || !lobby.gameData.isGameActive) {
                return;
            }
            
            // Set processing flag immediately
            lobby.gameData.processingTurn = true;
            
            // Stop message collector if it exists
            stopMessageCollector(lobby);
            
            // Handle timeout
            lobby.gameData.lives[currentPlayerId]--;
            lobby.gameData.logs.push({
                player: currentPlayerId,
                word: '❌ Timeout',
                seq: lobby.gameData.currentSeq
            });
            
            if (lobby.gameData.logs.length > 5) {
                lobby.gameData.logs.splice(0, lobby.gameData.logs.length - 5);
            }
            
            // Generate new sequence avoiding recent ones after timeout
            let newSequence;
            let attempts = 0;
            do {
                newSequence = getRandomSequence(lobby.gameData.dictionary, Math.random() < 0.5 ? 2 : 3);
                attempts++;
            } while (lobby.gameData.sequenceHistory.includes(newSequence) && attempts < 20);
            
            lobby.gameData.currentSeq = newSequence;
            
            // Track sequence history to avoid repetition (keep last 5 sequences)
            lobby.gameData.sequenceHistory.push(newSequence);
            if (lobby.gameData.sequenceHistory.length > 5) {
                lobby.gameData.sequenceHistory.shift();
            }
            
            // Clear timeout reference 
            lobby.gameData.timeout = null;
            saveLobbies();

            // Check for game end
            const alivePlayers = Object.values(lobby.gameData.lives).filter(lives => lives > 0).length;
            if (alivePlayers <= 1) {
                const winnerId = Object.keys(lobby.gameData.lives).find(id => lobby.gameData.lives[id] > 0);
                lobby.gameData.processingTurn = false; // Reset flag before ending
                await endGameCallback(`🎉 Game over! The winner is <@${winnerId}>`);
                return;
            }

            // Move to next player
            lobby.gameData.currentPlayerIndex = (lobby.gameData.currentPlayerIndex + 1) % playersInGame.length;
            while (lobby.gameData.lives[playersInGame[lobby.gameData.currentPlayerIndex]] <= 0) {
                lobby.gameData.currentPlayerIndex = (lobby.gameData.currentPlayerIndex + 1) % playersInGame.length;
            }
            
            // Reset processing flag before next turn
            lobby.gameData.processingTurn = false;
            await nextTurnCallback();
            
        } catch (error) {
            console.error('Error in timeout handler:', error);
            lobby.gameData.processingTurn = false;
        }
    }, lobby.settings.turnTime * 1000);
}

/**
 * Returns players to the lobby interface after a game ends
 */
async function returnToLobby(interaction, lobby, guildId, gameId) {
    try {
        await interaction.editReply({
            content: null,
            embeds: [generateLobbyEmbed(lobby)],
            components: lobbyComponents()
        });

        const message = await interaction.fetchReply();

        // Restart lobby collectors
        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 300000 // 5 minutes for lobby activity
        });

        const selectCollector = message.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: 300000
        });

        // Handle button interactions (reuse the lobby logic)
        await handleLobbyButtonInteractions(collector, interaction, lobby, guildId, gameId);
        
        // Handle select menu interactions
        await handleLobbySelectInteractions(selectCollector, interaction, lobby);

    } catch (err) {
        console.error('Failed to return to lobby:', err);
        // Fallback: close the lobby if we can't return to it
        delete lobbies[guildId][gameId];
        saveLobbies();
    }
}

/**
 * Handles lobby button interactions (extracted for reuse)
 */
async function handleLobbyButtonInteractions(collector, interaction, initialLobby, guildId, gameId) {
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
                ephemeral: true
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
            return await startGame(i, interaction, lobby, guildId, gameId);
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
}

/**
 * Handles lobby select menu interactions (extracted for reuse)
 */
async function handleLobbySelectInteractions(selectCollector, interaction, initialLobby) {
    selectCollector.on('collect', async i => {
        const guildId = interaction.guild.id;
        const gameId = initialLobby.gameId;
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
}

/**
 * Handles the start game logic (extracted for reuse)
 */
async function startGame(i, interaction, lobby, guildId, gameId) {
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

    const initialSeq = getRandomSequence(dictionary, Math.random() < 0.5 ? 2 : 3);
    const currentLobby = lobbies[guildId][gameId];
    currentLobby.gameData = {
        dictionary: dictionary,
        usedWords: new Set(),
        usedLetters: initialUsedLetters,
        logs: [],
        lives: initialLives,
        currentSeq: initialSeq,
        sequenceHistory: [initialSeq],
        currentPlayerIndex: 0,
        gameStartTime: Date.now(),
        timeout: null,
        messageCollector: null,
        processingTurn: false,
        isGameActive: true,
        wordsPlayedCount: 0,
    };
    saveLobbies();

    const stopRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('stop_game').setLabel('Stop Game').setStyle(ButtonStyle.Danger).setEmoji('🛑')
    );

    const gameMessage = await interaction.editReply({
        content: `🎮 Game started! First turn: <@${playersInGame[0]}>. You have **${lobby.settings.turnTime}s** to type a word containing: \`${currentLobby.gameData.currentSeq}\``,
        embeds: [createGameEmbed(currentLobby, playersInGame[0])],
        components: [stopRow],
    });

    const endGame = async (reason) => {
        const currentLobby = lobbies[guildId][gameId];
        if (!currentLobby || !currentLobby.gameData) return;

        // Clean up all game resources
        clearLobbyTimeout(currentLobby);
        stopMessageCollector(currentLobby);
        currentLobby.gameData.isGameActive = false;
        currentLobby.gameData.processingTurn = false;

        // Reset lobby to pre-game state but keep players and settings
        const finalGameData = { ...currentLobby.gameData };
        currentLobby.gameData = null;
        currentLobby.lastActivity = Date.now();
        saveLobbies();

        // Create "Back to Lobby" button
        const backToLobbyRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('back_to_lobby')
                .setLabel('Back to Lobby')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🏠'),
            new ButtonBuilder()
                .setCustomId('close_lobby')
                .setLabel('Close Lobby')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🗑️')
        );

        try {
            const gameEndMessage = await interaction.editReply({
                content: reason,
                embeds: [createGameEmbed({ gameId: currentLobby.gameId, gameData: finalGameData }, playersInGame[finalGameData.currentPlayerIndex])],
                components: [backToLobbyRow],
            });

            // Create collector for post-game buttons
            const postGameCollector = gameEndMessage.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 300000 // 5 minutes to decide
            });

            postGameCollector.on('collect', async postBtn => {
                const updatedLobby = lobbies[guildId][gameId];
                if (!updatedLobby) {
                    return postBtn.reply({
                        content: '❌ This lobby no longer exists.',
                        ephemeral: true
                    });
                }

                if (postBtn.customId === 'back_to_lobby') {
                    if (!updatedLobby.players.includes(postBtn.user.id)) {
                        return postBtn.reply({
                            content: '❌ You are not in this lobby.',
                            ephemeral: true
                        });
                    }

                    await postBtn.deferUpdate();
                    postGameCollector.stop('back_to_lobby');

                    // Return to lobby interface
                    await returnToLobby(interaction, updatedLobby, guildId, gameId);
                    
                } else if (postBtn.customId === 'close_lobby') {
                    if (postBtn.user.id !== updatedLobby.owner) {
                        return postBtn.reply({
                            content: '❌ Only the owner can close the lobby.',
                            ephemeral: true
                        });
                    }

                    await postBtn.deferUpdate();
                    postGameCollector.stop('closed');

                    // Delete lobby completely
                    delete lobbies[guildId][gameId];
                    saveLobbies();

                    await interaction.editReply({
                        content: '🗑️ Lobby has been closed.',
                        embeds: [],
                        components: []
                    });
                }
            });

            postGameCollector.on('end', (collected, reason) => {
                if (reason === 'time') {
                    // Auto-close after timeout
                    const lobbyStillExists = lobbies[guildId] && lobbies[guildId][gameId];
                    if (lobbyStillExists) {
                        delete lobbies[guildId][gameId];
                        saveLobbies();
                    }
                    
                    interaction.editReply({
                        content: '🕐 Lobby closed due to inactivity.',
                        embeds: [],
                        components: []
                    }).catch(() => {});
                }
            });

        } catch (err) {
            console.error('Failed to edit message on game end:', err);
            // Fallback: delete lobby if message editing fails
            delete lobbies[guildId][gameId];
            saveLobbies();
        }
    };

    const updateGameMessage = async () => {
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
    };

    // Enhanced nextTurn function with proper cleanup and race condition handling
    const nextTurn = async () => {
        const currentLobby = lobbies[guildId][gameId];
        if (!currentLobby || !currentLobby.gameData || !currentLobby.gameData.isGameActive) return;

        // Clear any existing timeout and message collector
        clearLobbyTimeout(currentLobby);
        stopMessageCollector(currentLobby);
        
        // Reset processing flag
        currentLobby.gameData.processingTurn = false;
        
        await updateGameMessage();

        const currentPlayerId = playersInGame[currentLobby.gameData.currentPlayerIndex];

        // Create message collector for this turn
        const msgCollector = interaction.channel.createMessageCollector({
            filter: m => m.author.id === currentPlayerId,
            time: currentLobby.settings.turnTime * 1000
        });

        // Store collector reference for cleanup
        currentLobby.gameData.messageCollector = msgCollector;

        // Set up timeout
        setPlayerTimeout(currentLobby, interaction, playersInGame, endGame, nextTurn);

        msgCollector.on('collect', async msg => {
            // Prevent race conditions - check if we're already processing or game ended
            if (currentLobby.gameData.processingTurn || !currentLobby.gameData.isGameActive) {
                await msg.delete().catch(() => {});
                return;
            }
            
            // Set processing flag immediately to prevent race conditions
            currentLobby.gameData.processingTurn = true;
            
            const content = msg.content.toLowerCase().trim();
            await msg.delete().catch(() => {});
            
            const updatedLobby = lobbies[guildId][gameId];
            if (!updatedLobby || !updatedLobby.gameData || !updatedLobby.gameData.isGameActive) {
                return;
            }

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
            const isWordUsed = updatedLobby.gameData.usedWords.has(content);

            if (isValidWord && containsSequence && !isWordUsed) {
                // Valid word - stop collector and timeout immediately
                msgCollector.stop('valid_word');
                clearLobbyTimeout(updatedLobby);

                updatedLobby.gameData.usedWords.add(content);

                // Ensure usedLetters is a Map
                if (!(updatedLobby.gameData.usedLetters instanceof Map)) {
                    const usedLettersMap = new Map();
                    for (const userId in updatedLobby.gameData.usedLetters) {
                        usedLettersMap.set(userId, new Set(updatedLobby.gameData.usedLetters[userId] || []));
                    }
                    updatedLobby.gameData.usedLetters = usedLettersMap;
                }

                // Get the current player's personal used letters set
                let playerUsedLetters = updatedLobby.gameData.usedLetters.get(currentPlayerId);
                if (!playerUsedLetters) {
                    playerUsedLetters = new Set();
                    updatedLobby.gameData.usedLetters.set(currentPlayerId, playerUsedLetters);
                }
                
                // Add each letter of the played word to their personal set (only a-v)
                for (const letter of content) {
                    if (letter >= 'a' && letter <= 'v') {
                        playerUsedLetters.add(letter);
                    }
                }
                
                // Ensure the updated set is saved back to the map
                updatedLobby.gameData.usedLetters.set(currentPlayerId, playerUsedLetters);

                // Initialize wordsPlayedCount if it doesn't exist
                if (!updatedLobby.gameData.wordsPlayedCount) {
                    updatedLobby.gameData.wordsPlayedCount = 0;
                }
                updatedLobby.gameData.wordsPlayedCount++;

                updatedLobby.gameData.logs.push({
                    player: currentPlayerId,
                    word: content,
                    seq: updatedLobby.gameData.currentSeq
                });
                if (updatedLobby.gameData.logs.length > 5) updatedLobby.gameData.logs.splice(0, updatedLobby.gameData.logs.length - 5);

                // Check if this player has now completed their alphabet (a-v = 22 letters)
                if (playerUsedLetters.size >= 22) {
                    updatedLobby.gameData.lives[currentPlayerId]++;
                    updatedLobby.gameData.logs.push({
                        player: 'System',
                        word: `<@${currentPlayerId}> completed alphabet! +1 life`,
                        seq: '—'
                    });
                    if (updatedLobby.gameData.logs.length > 5) updatedLobby.gameData.logs.splice(0, updatedLobby.gameData.logs.length - 5);
                    // Reset the player's alphabet to start over
                    updatedLobby.gameData.usedLetters.set(currentPlayerId, new Set());
                }

                // Generate new sequence avoiding recent ones
                let newSequence;
                let attempts = 0;
                do {
                    newSequence = getRandomSequence(updatedLobby.gameData.dictionary, Math.random() < 0.5 ? 2 : 3);
                    attempts++;
                } while (updatedLobby.gameData.sequenceHistory.includes(newSequence) && attempts < 20);
                
                updatedLobby.gameData.currentSeq = newSequence;
                
                // Track sequence history to avoid repetition (keep last 5 sequences)
                updatedLobby.gameData.sequenceHistory.push(newSequence);
                if (updatedLobby.gameData.sequenceHistory.length > 5) {
                    updatedLobby.gameData.sequenceHistory.shift();
                }
                
                // Move to next player
                updatedLobby.gameData.currentPlayerIndex = (updatedLobby.gameData.currentPlayerIndex + 1) % playersInGame.length;
                while (updatedLobby.gameData.lives[playersInGame[updatedLobby.gameData.currentPlayerIndex]] <= 0) {
                    updatedLobby.gameData.currentPlayerIndex = (updatedLobby.gameData.currentPlayerIndex + 1) % playersInGame.length;
                }

                // Reset processing flag before starting next turn
                updatedLobby.gameData.processingTurn = false;
                saveLobbies();
                await nextTurn();
                
            } else {
                // Invalid word - clean up current turn and restart for same player
                
                // Stop current collector and timeout
                msgCollector.stop('invalid_word');
                clearLobbyTimeout(updatedLobby);
                
                let reason;
                if (!isValidWord) {
                    reason = 'Invalid word';
                } else if (!containsSequence) {
                    reason = 'No sequence';
                } else if (isWordUsed) {
                    reason = 'Already used';
                }

                updatedLobby.gameData.logs.push({
                    player: currentPlayerId,
                    word: `❌ ${content}`,
                    seq: updatedLobby.gameData.currentSeq
                });
                
                if (updatedLobby.gameData.logs.length > 5) {
                    updatedLobby.gameData.logs.splice(0, updatedLobby.gameData.logs.length - 5);
                }
                
                // Reset processing flag before restarting turn
                updatedLobby.gameData.processingTurn = false;
                saveLobbies();
                await updateGameMessage();
                
                // Send ephemeral feedback to player
                try {
                    const channel = interaction.channel;
                    const tempMsg = await channel.send(`<@${currentPlayerId}> ❌ ${reason}. Try again.`);
                    setTimeout(() => tempMsg.delete().catch(() => {}), 3000);
                } catch (err) {
                    console.error('Failed to send invalid word message:', err);
                }

                // Restart the turn for the same player with a small delay to prevent rapid-fire
                setTimeout(async () => {
                    const currentLobby = lobbies[guildId][gameId];
                    if (currentLobby && currentLobby.gameData && currentLobby.gameData.isGameActive) {
                        await nextTurn();
                    }
                }, 100);
                return; // Exit early to prevent the collector.on('end') from interfering
            }
        });

        msgCollector.on('end', (collected, reason) => {
            // Only handle timeout if it wasn't manually stopped and game is still active
            if (reason === 'time' && currentLobby.gameData && currentLobby.gameData.isGameActive && !currentLobby.gameData.processingTurn) {
                // The timeout callback will handle this case
                console.log('Message collector ended due to timeout');
            }
        });
    };

    // Set up stop game button collector
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

    // Start the first turn
    await nextTurn();
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
            time: 300000 // Increased to 5 minutes
        });

        const selectCollector = message.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: 300000 // Increased to 5 minutes
        });

        // Use the extracted functions for handling interactions
        await handleLobbyButtonInteractions(collector, interaction, lobbies[guildId][gameId], guildId, gameId);
        await handleLobbySelectInteractions(selectCollector, interaction, lobbies[guildId][gameId]);

        // Handle collector timeouts
        collector.on('end', (collected, reason) => {
            if (reason === 'time') {
                const lobby = lobbies[guildId] && lobbies[guildId][gameId];
                if (lobby && !lobby.gameData) {
                    delete lobbies[guildId][gameId];
                    saveLobbies();
                    interaction.editReply({
                        content: '🕐 Lobby closed due to inactivity.',
                        embeds: [],
                        components: []
                    }).catch(() => {});
                }
            }
        });

        selectCollector.on('end', (collected, reason) => {
            if (reason === 'time') {
                const lobby = lobbies[guildId] && lobbies[guildId][gameId];
                if (lobby && !lobby.gameData) {
                    delete lobbies[guildId][gameId];
                    saveLobbies();
                }
            }
        });
    },
};