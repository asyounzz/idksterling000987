const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
} = require('discord.js');
const fs = require('fs');
const path = require('path');

// Import the lobbies from your main lobby system
const lobbiesPath = path.join(__dirname, '..', 'lobbies.json');

/**
 * Loads lobbies from the JSON file to check if user is in a game
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
 * Checks if a user is currently in any active lobby
 */
function isUserInLobby(userId) {
    const lobbies = loadLobbies();
    
    for (const guildId in lobbies) {
        for (const gameId in lobbies[guildId]) {
            const lobby = lobbies[guildId][gameId];
            if (lobby.players && lobby.players.includes(userId)) {
                return {
                    inLobby: true,
                    gameId: lobby.gameId,
                    guildId: guildId
                };
            }
        }
    }
    
    return { inLobby: false };
}

/**
 * Loads dictionary words from specified language file
 */
function loadDictionary(language) {
    const filePath = path.join(__dirname, 'dics', `${language}.txt`);
    
    if (!fs.existsSync(filePath)) {
        console.error(`Dictionary file not found for language: ${language}`);
        return [];
    }
    
    try {
        const words = fs.readFileSync(filePath, 'utf-8')
            .split(/\r?\n/)
            .map(w => w.trim().toLowerCase())
            .filter(Boolean);
        
        return words;
    } catch (error) {
        console.error(`Error reading dictionary file for ${language}:`, error);
        return [];
    }
}

/**
 * Searches for words containing the given sequence
 */
function searchWords(dictionary, sequence) {
    const lowerSequence = sequence.toLowerCase();
    return dictionary.filter(word => word.includes(lowerSequence));
}

/**
 * Creates an embed for displaying words with pagination
 */
function createWordsEmbed(words, sequence, language, page, totalPages) {
    const wordsPerPage = 20;
    const startIndex = (page - 1) * wordsPerPage;
    const endIndex = startIndex + wordsPerPage;
    const pageWords = words.slice(startIndex, endIndex);
    
    const embed = new EmbedBuilder()
        .setTitle(`📚 Dictionary Search Results`)
        .setDescription(`**Language:** ${language.charAt(0).toUpperCase() + language.slice(1)}\n**Sequence:** \`${sequence}\`\n**Found:** ${words.length} words`)
        .setColor(0x00AE86)
        .setFooter({ text: `Page ${page} of ${totalPages}` });

    if (pageWords.length > 0) {
        // Split words into columns for better readability
        const columns = [];
        const wordsPerColumn = Math.ceil(pageWords.length / 2);
        
        for (let i = 0; i < pageWords.length; i += wordsPerColumn) {
            columns.push(pageWords.slice(i, i + wordsPerColumn));
        }
        
        columns.forEach((column, index) => {
            if (column.length > 0) {
                embed.addFields({
                    name: index === 0 ? '📝 Words' : '\u200b',
                    value: column.map(word => `\`${word}\``).join('\n'),
                    inline: true
                });
            }
        });
    } else {
        embed.addFields({
            name: '❌ No Results',
            value: 'No words found containing this sequence.',
            inline: false
        });
    }

    return embed;
}

/**
 * Creates navigation buttons for pagination
 */
function createNavigationButtons(currentPage, totalPages, wordsFound) {
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('first_page')
            .setLabel('⏪')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage === 1),
        new ButtonBuilder()
            .setCustomId('prev_page')
            .setLabel('◀️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage === 1),
        new ButtonBuilder()
            .setCustomId('page_info')
            .setLabel(`${currentPage} / ${totalPages}`)
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId('next_page')
            .setLabel('▶️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage === totalPages),
        new ButtonBuilder()
            .setCustomId('last_page')
            .setLabel('⏩')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage === totalPages)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('words_found')
            .setLabel(`${wordsFound} words found`)
            .setStyle(ButtonStyle.Success)
            .setDisabled(true)
    );

    return [row1, row2];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('words')
        .setDescription('Search for words containing a specific sequence in the dictionary')
        .addStringOption(option =>
            option.setName('language')
                .setDescription('Choose dictionary language')
                .setRequired(true)
                .addChoices(
                    { name: 'English', value: 'english' },
                    { name: 'French', value: 'french' }
                ))
        .addStringOption(option =>
            option.setName('sequence')
                .setDescription('Letter sequence to search for')
                .setRequired(true)
                .setMinLength(1)
                .setMaxLength(10)),

    async execute(interaction) {
        const language = interaction.options.getString('language');
        const sequence = interaction.options.getString('sequence');
        const userId = interaction.user.id;

        // Check if user is in an active lobby
        const lobbyStatus = isUserInLobby(userId);
        if (lobbyStatus.inLobby) {
            return interaction.reply({
                content: `❌ You cannot use this command while you're in a multiplayer lobby (Game ID: \`${lobbyStatus.gameId}\`). Leave the lobby first or wait for the game to end.`,
                ephemeral: true
            });
        }

        // Validate sequence (only letters)
        if (!/^[a-zA-Z]+$/.test(sequence)) {
            return interaction.reply({
                content: '❌ Sequence must contain only letters (a-z).',
                ephemeral: true
            });
        }

        await interaction.deferReply();

        try {
            // Load dictionary
            const dictionary = loadDictionary(language);
            
            if (dictionary.length === 0) {
                return interaction.editReply({
                    content: `❌ Failed to load ${language} dictionary. Please try again later.`
                });
            }

            // Search for words
            const matchingWords = searchWords(dictionary, sequence);
            
            if (matchingWords.length === 0) {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('📚 Dictionary Search Results')
                            .setDescription(`**Language:** ${language.charAt(0).toUpperCase() + language.slice(1)}\n**Sequence:** \`${sequence}\``)
                            .addFields({
                                name: '❌ No Results',
                                value: 'No words found containing this sequence.',
                                inline: false
                            })
                            .setColor(0xFF4444)
                    ]
                });
            }

            // Setup pagination
            const wordsPerPage = 20;
            const totalPages = Math.ceil(matchingWords.length / wordsPerPage);
            let currentPage = 1;

            // Create initial embed and buttons
            const embed = createWordsEmbed(matchingWords, sequence, language, currentPage, totalPages);
            const buttons = createNavigationButtons(currentPage, totalPages, matchingWords.length);

            const message = await interaction.editReply({
                embeds: [embed],
                components: totalPages > 1 ? buttons : [buttons[1]] // Only show word count if single page
            });

            // Only create collector if there are multiple pages
            if (totalPages > 1) {
                const collector = message.createMessageComponentCollector({
                    componentType: ComponentType.Button,
                    time: 300000 // 5 minutes
                });

                collector.on('collect', async buttonInteraction => {
                    // Only allow the original user to navigate
                    if (buttonInteraction.user.id !== userId) {
                        return buttonInteraction.reply({
                            content: '❌ Only the user who ran this command can navigate the pages.',
                            ephemeral: true
                        });
                    }

                    // Handle navigation
                    switch (buttonInteraction.customId) {
                        case 'first_page':
                            currentPage = 1;
                            break;
                        case 'prev_page':
                            currentPage = Math.max(1, currentPage - 1);
                            break;
                        case 'next_page':
                            currentPage = Math.min(totalPages, currentPage + 1);
                            break;
                        case 'last_page':
                            currentPage = totalPages;
                            break;
                        default:
                            return; // Ignore disabled buttons
                    }

                    // Update embed and buttons
                    const newEmbed = createWordsEmbed(matchingWords, sequence, language, currentPage, totalPages);
                    const newButtons = createNavigationButtons(currentPage, totalPages, matchingWords.length);

                    await buttonInteraction.update({
                        embeds: [newEmbed],
                        components: newButtons
                    });
                });

                collector.on('end', () => {
                    // Disable all buttons when collector expires
                    const disabledButtons = buttons.map(row => {
                        const newRow = new ActionRowBuilder();
                        row.components.forEach(button => {
                            newRow.addComponents(
                                ButtonBuilder.from(button).setDisabled(true)
                            );
                        });
                        return newRow;
                    });

                    interaction.editReply({
                        components: disabledButtons
                    }).catch(() => {}); // Ignore errors if message was deleted
                });
            }

        } catch (error) {
            console.error('Error in words command:', error);
            return interaction.editReply({
                content: '❌ An error occurred while searching the dictionary. Please try again later.'
            });
        }
    }
};