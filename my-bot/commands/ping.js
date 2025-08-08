const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('🏓 Check if the bot is online and responsive.'),

  async execute(interaction) {
    const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
    const ping = sent.createdTimestamp - interaction.createdTimestamp;

    await interaction.editReply(`🏓 Pong!\n🔧 Bot Latency: **${ping}ms**\n📡 API Latency: **${interaction.client.ws.ping}ms**`);
  }
};