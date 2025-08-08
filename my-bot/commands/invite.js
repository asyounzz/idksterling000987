const { SlashCommandBuilder, EmbedBuilder, Colors } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('invite')
    .setDescription('Generates an invite link for the bot'),

  async execute(interaction) {
    // Create the invite URL
    const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${interaction.client.user.id}&permissions=8&scope=bot%20applications.commands`;

    // Create the embed response
    const embed = new EmbedBuilder()
      .setTitle('Invite Me!')
      .setDescription('You can invite me to your server using the link below:')
      .addFields(
        { name: 'Invite Link', value: `[Click here to invite the bot!](<${inviteUrl}>)`, inline: false }
      )
      .setColor(Colors.Blurple)
      .setFooter({ text: 'Thanks for adding me to your server!' });

    // Send the response with the invite link
    await interaction.reply({ embeds: [embed] });
  },
};