const { SlashCommandBuilder, EmbedBuilder, Colors } = require('discord.js');
const os = require('os');
const moment = require('moment'); // Make sure to install moment.js if not already installed

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Get some statistics about the bot'),

  async execute(interaction) {
    const bot = interaction.client;

    // Calculate uptime
    const uptime = moment.duration(bot.uptime).humanize();

    // Get guild (server) count
    const guildCount = bot.guilds.cache.size;

    // Get user count
    const userCount = bot.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);

    // Get memory usage (optional, for bot's memory consumption)
    const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024; // MB
    const memoryUsageFormatted = memoryUsage.toFixed(2);

    // Get system stats (optional)
    const cpuUsage = os.cpus()[0].model;
    const systemArchitecture = os.arch();
    const systemPlatform = os.platform();

    // Create the embed
    const embed = new EmbedBuilder()
      .setTitle('Bot Statistics')
      .setDescription('Here are some stats about the bot.')
      .setColor(Colors.Blurple)
      .addFields(
        { name: 'Uptime', value: uptime, inline: true },
        { name: 'Guilds', value: `${guildCount} servers`, inline: true },
        { name: 'Users', value: `${userCount} users`, inline: true },
        { name: 'Memory Usage', value: `${memoryUsageFormatted} MB`, inline: true },
        { name: 'CPU', value: cpuUsage, inline: true },
        { name: 'System', value: `${systemPlatform} ${systemArchitecture}`, inline: true }
      )
      .setFooter({ text: `Bot version: ${bot.version || 'N/A'}` });

    // Send the response
    await interaction.reply({ embeds: [embed] });
  },
};