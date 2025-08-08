const { SlashCommandBuilder, EmbedBuilder, Colors } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Get detailed information about the server.'),

  async execute(interaction) {
    // Get the guild (server) the command was run in
    const guild = interaction.guild;

    // Get the guild owner information
    const owner = await guild.fetchOwner();

    // Create the embed with advanced server information
    const serverEmbed = new EmbedBuilder()
      .setTitle(`${guild.name} Server Information`)
      .setColor(Colors.Blue)
      .setThumbnail(guild.iconURL({ dynamic: true, size: 1024 })) // Display server icon
      .addFields(
        {
          name: 'Server Name',
          value: guild.name,
          inline: true,
        },
        {
          name: 'Server ID',
          value: guild.id.toString(), // Convert to string
          inline: true,
        },
        {
          name: 'Server Owner',
          value: `${owner.user.tag} (${owner.user.id})`,
          inline: true,
        },
        {
          name: 'Creation Date',
          value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`,
          inline: true,
        },
        {
          name: 'Region/Locale',
          value: guild.preferredLocale,
          inline: true,
        },
        {
          name: 'Verification Level',
          value: guild.verificationLevel.toString(), // Convert to string
          inline: true,
        },
        {
          name: 'Member Count',
          value: `${guild.memberCount} members`, // Convert to string
          inline: true,
        },
        {
          name: 'Boost Level',
          value: `Level ${guild.premiumTier} (${guild.premiumSubscriptionCount.toString()} boosts)`, // Convert to string
          inline: true,
        },
        {
          name: 'Roles Count',
          value: `${guild.roles.cache.size} roles`, // Convert to string
          inline: true,
        },
        {
          name: 'Emojis Count',
          value: `${guild.emojis.cache.size} emojis`, // Convert to string
          inline: true,
        },
        {
          name: 'AFK Timeout',
          value: `${guild.afkTimeout / 60} minutes`, // Convert to string
          inline: true,
        },
        {
          name: 'AFK Channel',
          value: guild.afkChannel ? guild.afkChannel.name : 'None',
          inline: true,
        },
        {
          name: 'Server Icon',
            value: guild.iconURL({ dynamic: true, size: 1024 }) ? `[Click here to view](${guild.iconURL({ dynamic: true, size: 1024 })})` : 'No Icon', // Check for icon
            inline: true,
        },
        {
          name: 'Server Banner',
          value: guild.banner ? `[Click here to view](${guild.bannerURL({ dynamic: true, size: 1024 })})` : 'No Banner',
          inline: true,
        }
      )

      .setFooter({ text: `Requested by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });

    // Send the embed as a reply to the interaction
    await interaction.reply({ embeds: [serverEmbed] });
  },
};