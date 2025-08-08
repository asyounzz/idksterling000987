const { SlashCommandBuilder, EmbedBuilder, Colors } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Get the avatar of a user or yourself.')
    .addUserOption(option => 
      option.setName('user')
        .setDescription('Select a user to view their avatar')
        .setRequired(false)
    ),

  async execute(interaction) {
    // Get the user from the option or default to the command user
    const user = interaction.options.getUser('user') || interaction.user;

    // Create an embed with the user's avatar
    const avatarEmbed = new EmbedBuilder()
      .setTitle(`${user.username}'s Avatar`)
      .setImage(user.displayAvatarURL({ dynamic: true, size: 1024 })) // You can change the size if needed
      .setColor(Colors.Blue);

    // Send the embed as a reply
    await interaction.reply({ embeds: [avatarEmbed] });
  },
};