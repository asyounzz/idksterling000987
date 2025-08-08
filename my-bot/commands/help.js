const {
  SlashCommandBuilder,
  EmbedBuilder,
  Colors,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Shows the help page for all commands or a specific command description.')
    .addStringOption(option =>
      option
        .setName('command')
        .setDescription('The command you want help with')
        .setRequired(false)
        .setAutocomplete(true)),

  async execute(interaction) {
    const commandName = interaction.options.getString('command');

    // List of commands categorized by type
    const badgeCommands = {
      'bombparty': 'Starts a solo game of BombParty (against AI).',
      'lobby': 'Let you create a multiplayer lobby of BombParty (2-6 players)',
      'howtoplay': 'Gives you the beginner guide to play BombParty.'
      
    };

    const utilityCommands = {
      'ping': 'Pong!',
      'userinfo': 'Obtain some informations about an user.',
      'help': 'View all bot commands!',
      'avatar': 'Get the avatar of a user.',
      'serverinfo': 'Get detailed information about the server.',
      'stats': 'Get some stats about the bot.',
      'invite': 'Returns the invite link of the bot.',
    };

    if (!commandName) {
      // If no command name is provided, send a general help page with two sections
      const helpEmbed = new EmbedBuilder()
        .setTitle('Help Page')
        .setDescription('# Here is a list of available commands:')
        .setColor(Colors.Blue);

      // Add badges-related commands section
      helpEmbed.addFields({
        name: '💣 BombParty Commands',
        value: Object.keys(badgeCommands)
          .map(command => `/**${command}** - ${badgeCommands[command]}`)
          .join('\n'),
      });

      // Add utilities section
      helpEmbed.addFields({
        name: '<:globe:1360200653745426495> Utility Commands',
        value: Object.keys(utilityCommands)
          .map(command => `/**${command}** - ${utilityCommands[command]}`)
          .join('\n'),
      });

      return interaction.reply({ embeds: [helpEmbed] });
    }

    // If a command name is provided, check if it exists and show its description
    if (badgeCommands[commandName]) {
      const commandHelpEmbed = new EmbedBuilder()
        .setTitle(`Help for /${commandName}`)
        .setDescription(badgeCommands[commandName])
        .setColor(Colors.Green);

      return interaction.reply({ embeds: [commandHelpEmbed] });
    }

    if (utilityCommands[commandName]) {
      const commandHelpEmbed = new EmbedBuilder()
        .setTitle(`Help for /${commandName}`)
        .setDescription(utilityCommands[commandName])
        .setColor(Colors.Green);

      return interaction.reply({ embeds: [commandHelpEmbed] });
    }

    // If the command doesn't exist, show an error
    return interaction.reply({
      content: 'Sorry, that command does not exist.',
      ephemeral: true,
    });
  },

  // Autocomplete handler for the 'command' option
  async autocomplete(interaction) {
    const focusedOption = interaction.options.getFocused(true);
    if (focusedOption.name === 'command') {
      const commandName = focusedOption.value;
      const allCommands = {
        ...badgeCommands,
        ...utilityCommands,
      };
      const filteredCommands = Object.keys(allCommands)
        .filter(command => command.startsWith(commandName))
        .map(command => ({ name: command, value: command }));

      return interaction.respond(filteredCommands);
    }
  },
};
