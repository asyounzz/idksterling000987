const {
    SlashCommandBuilder,
    EmbedBuilder,
    Collection
} = require('discord.js');
const fs = require('fs');
const path = require('path');

// Import active games collection (you might need to adjust this path)
// If you can't import it directly, we'll recreate it
let activeGames;
try {
    // Try to import from bombparty.js if it exports activeGames
    activeGames = require('./bombparty.js').activeGames;
} catch (error) {
    // Create our own Collection if import fails
    activeGames = new Collection();
}

const lobbiesPath = path.join(__dirname, '..', 'lobbies.json');

/**
 * Loads lobbies from the JSON file
 */
function loadLobbies() {
    if (fs.existsSync(lobbiesPath)) {
        try {
            const rawData = fs.readFileSync(lobbiesPath, 'utf8');
            return JSON.parse(rawData);
        } catch (error) {
            console.error('Error loading lobbies:', error);
            return {};
        }
    }
    return {};
}

/**
 * Saves lobbies to the JSON file
 */
function saveLobbies(lobbies) {
    try {
        fs.writeFileSync(lobbiesPath, JSON.stringify(lobbies, null, 2));
    } catch (error) {
        console.error('Error saving lobbies:', error);
    }
}

/**
 * Finds all games/lobbies the user is currently in
 */
function findUserGames(userId) {
    const userGames = {
        singlePlayer: false,
        multiPlayer: []
    };

    // Check single-player games (bombparty vs bot)
    if (activeGames && activeGames.has(userId)) {
        userGames.singlePlayer = true;
    }

    // Check multiplayer lobbies
    const lobbies = loadLobbies();
    for (const guildId in lobbies) {
        for (const gameId in lobbies[guildId]) {
            const lobby = lobbies[guildId][gameId];
            if (lobby.players && lobby.players.includes(userId)) {
                userGames.multiPlayer.push({
                    guildId,
                    gameId,
                    lobby,
                    isOwner: lobby.owner === userId,
                    inGame: !!lobby.gameData
                });
            }
        }
    }

    return userGames;
}

/**
 * Removes user from single-player game
 */
function leaveSinglePlayerGame(userId) {
    if (activeGames && activeGames.has(userId)) {
        activeGames.delete(userId);
        return true;
    }
    return false;
}

/**
 * Removes user from multiplayer lobby
 */
function leaveMultiPlayerLobby(userId, guildId, gameId) {
    const lobbies = loadLobbies();
    
    if (!lobbies[guildId] || !lobbies[guildId][gameId]) {
        return { success: false, reason: 'Lobby not found' };
    }

    const lobby = lobbies[guildId][gameId];
    
    if (!lobby.players.includes(userId)) {
        return { success: false, reason: 'Not in lobby' };
    }

    // If user is owner, transfer ownership or delete lobby
    if (lobby.owner === userId) {
        const otherPlayers = lobby.players.filter(id => id !== userId);
        
        if (otherPlayers.length > 0) {
            // Transfer ownership to first remaining player
            lobby.owner = otherPlayers[0];
            lobby.players = otherPlayers;
        } else {
            // Delete lobby if owner is last player
            delete lobbies[guildId][gameId];
            if (Object.keys(lobbies[guildId]).length === 0) {
                delete lobbies[guildId];
            }
            saveLobbies(lobbies);
            return { success: true, reason: 'Lobby deleted (you were the last player)' };
        }
    } else {
        // Just remove player
        lobby.players = lobby.players.filter(id => id !== userId);
    }

    saveLobbies(lobbies);
    return { success: true, reason: 'Left successfully' };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leave')
        .setDescription('Leave any active BombParty games or lobbies')
        .addBooleanOption(option =>
            option.setName('force')
                .setDescription('Force leave even if you are the lobby owner')
                .setRequired(false)),

    async execute(interaction) {
        const userId = interaction.user.id;
        const forceLeave = interaction.options.getBoolean('force') || false;
        
        await interaction.deferReply({ ephemeral: true });

        // Find all games user is in
        const userGames = findUserGames(userId);
        
        if (!userGames.singlePlayer && userGames.multiPlayer.length === 0) {
            return interaction.editReply({
                content: '✅ You are not currently in any BombParty games or lobbies.',
            });
        }

        const results = [];
        let totalLeft = 0;

        // Leave single-player game
        if (userGames.singlePlayer) {
            const success = leaveSinglePlayerGame(userId);
            if (success) {
                results.push('✅ Left single-player BombParty game');
                totalLeft++;
            } else {
                results.push('❌ Failed to leave single-player game');
            }
        }

        // Leave multiplayer lobbies
        for (const gameInfo of userGames.multiPlayer) {
            const { guildId, gameId, lobby, isOwner, inGame } = gameInfo;
            
            // Warn if trying to leave as owner without force
            if (isOwner && !forceLeave && lobby.players.length > 1) {
                results.push(`⚠️ Lobby \`${gameId}\`: You are the owner. Use \`force: True\` to transfer ownership or delete lobby.`);
                continue;
            }

            // Warn if leaving during active game
            if (inGame && !forceLeave) {
                results.push(`⚠️ Lobby \`${gameId}\`: Game is active. Use \`force: True\` to force leave.`);
                continue;
            }

            const result = leaveMultiPlayerLobby(userId, guildId, gameId);
            if (result.success) {
                results.push(`✅ Lobby \`${gameId}\`: ${result.reason}`);
                totalLeft++;
            } else {
                results.push(`❌ Lobby \`${gameId}\`: ${result.reason}`);
            }
        }

        // Create response embed
        const embed = new EmbedBuilder()
            .setTitle('🚪 Leave Results')
            .setDescription(results.join('\n'))
            .setColor(totalLeft > 0 ? 0x00ff00 : 0xff9900);

        if (totalLeft > 0) {
            embed.setFooter({ text: `Successfully left ${totalLeft} game(s)/lobby(ies)` });
        }

        // Add helpful tips
        if (results.some(r => r.includes('⚠️'))) {
            embed.addFields({
                name: '💡 Tips',
                value: '• Use `/leave force: True` to force leave as owner\n• Use `/leave force: True` to leave during active games\n• Owners can transfer ownership in the lobby before leaving',
                inline: false
            });
        }

        await interaction.editReply({ embeds: [embed] });
    },
};

/* 
IMPORTANT INTEGRATION NOTES:

1. **For bombparty.js**: You need to export the activeGames Collection:
   Add this at the end of bombparty.js:
   
   module.exports = {
     data: ..., // your existing data
     execute: ..., // your existing execute
     activeGames: activeGames // ADD THIS LINE
   };

2. **Alternative approach**: If you can't modify bombparty.js, create a shared game state file:
   
   // shared-state.js
   const { Collection } = require('discord.js');
   module.exports = {
     activeGames: new Collection()
   };
   
   Then import this in both bombparty.js and leave.js

3. **Path adjustments**: Make sure the lobbiesPath points to the correct location
   relative to where you place this leave.js file.

4. **Testing**: Test edge cases like:
   - Leaving when you're the only player in lobby
   - Leaving during active multiplayer games
   - Leaving when lobby data is corrupted
*/