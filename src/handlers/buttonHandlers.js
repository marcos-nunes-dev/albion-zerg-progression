const { generateLeaderboardEmbed } = require('../utils/leaderboard');

// Button interaction handlers
class ButtonHandlers {
    constructor(guildProgressionService) {
        this.guildProgressionService = guildProgressionService;
    }

    async handleLeaderboardNavigation(interaction) {
        try {
            const customId = interaction.customId;
            
            // Handle leaderboard navigation buttons
            if (customId.startsWith('leaderboard_prev_') || customId.startsWith('leaderboard_next_')) {
                await interaction.deferUpdate();
                
                const parts = customId.split('_');
                const direction = parts[1]; // 'prev' or 'next'
                const sortOption = parts[2];
                const page = parseInt(parts[3]);
                
                const result = await generateLeaderboardEmbed(this.guildProgressionService, sortOption, page);
                
                if (result.error) {
                    await interaction.editReply({
                        content: `❌ ${result.error}`,
                        embeds: [],
                        components: []
                    });
                    return;
                }

                await interaction.editReply({
                    embeds: [result.embed],
                    components: result.components
                });

                console.log(`🏆 Leaderboard navigation: ${direction} to page ${page}, Sort: ${sortOption} by ${interaction.user.tag}`);
            }
            
        } catch (error) {
            console.error('Error handling button interaction:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ An error occurred while processing your request.',
                    flags: 64 // EPHEMERAL
                });
            }
        }
    }
}

module.exports = { ButtonHandlers };
