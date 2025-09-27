const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// Helper function to generate leaderboard embed
async function generateLeaderboardEmbed(guildProgressionService, sortOption, page, playersPerPage = 10) {
    // Find the progression channel
    const progressionChannel = await guildProgressionService.findOrCreateProgressionChannel();
    
    // Get all existing threads
    const existingThreads = await guildProgressionService.getExistingThreads(progressionChannel);
    
    if (existingThreads.length === 0) {
        return { embed: null, components: [], error: 'No player threads found. Run `/update-progression` first to create threads.' };
    }

    // Process each player's thread to get VOD count and ratings
    const playerStats = [];
    
    for (const threadInfo of existingThreads) {
        try {
            // Get the actual thread object
            const thread = progressionChannel.threads.cache.get(threadInfo.id);
            if (!thread) continue;

            // Extract player name from thread title
            const playerName = threadInfo.name.split(' ')[0];
            
            // Count VODs
            const vodResult = await guildProgressionService.countPlayerVODs(playerName);
            const vodCount = vodResult.success ? vodResult.vodCount : 0;

            // Get all messages in the thread to find ratings
            const messages = [];
            let lastMessageId = null;

            while (true) {
                const options = { limit: 100 };
                if (lastMessageId) {
                    options.before = lastMessageId;
                }

                const fetchedMessages = await thread.messages.fetch(options);
                if (fetchedMessages.size === 0) break;

                messages.push(...fetchedMessages.values());
                lastMessageId = fetchedMessages.last().id;
            }

            // Filter rating messages
            const ratingMessages = messages.filter(msg => 
                msg.embeds.length > 0 && 
                msg.embeds[0].title === '🎯 VOD Performance Rating' &&
                msg.embeds[0].fields.some(field => field.name === '📊 Analytics Data')
            );

            // Parse rating data
            const ratings = [];
            for (const msg of ratingMessages) {
                const analyticsField = msg.embeds[0].fields.find(field => field.name === '📊 Analytics Data');
                if (analyticsField) {
                    try {
                        // Clean the JSON string more thoroughly
                        let jsonString = analyticsField.value
                            .replace(/```json\n/g, '')
                            .replace(/\n```/g, '')
                            .replace(/```/g, '')
                            .trim();
                        
                        // Try to extract JSON from the string if it's embedded in other text
                        const jsonMatch = jsonString.match(/\{.*\}/s);
                        if (jsonMatch) {
                            jsonString = jsonMatch[0];
                        }
                        
                        const data = JSON.parse(jsonString);
                        ratings.push(data);
                    } catch (e) {
                        // Skip malformed ratings
                        continue;
                    }
                }
            }

            // Calculate average rating
            const avgRating = ratings.length > 0 
                ? (ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length).toFixed(2)
                : 0;

            playerStats.push({
                name: playerName,
                vodCount: vodCount,
                ratingCount: ratings.length,
                avgRating: parseFloat(avgRating)
            });

        } catch (error) {
            console.error(`Error processing thread ${threadInfo.name}:`, error);
            continue;
        }
    }

    // Sort players based on sort option
    switch (sortOption) {
        case 'vods_desc':
            playerStats.sort((a, b) => b.vodCount - a.vodCount);
            break;
        case 'vods_asc':
            playerStats.sort((a, b) => a.vodCount - b.vodCount);
            break;
        case 'rating_desc':
            playerStats.sort((a, b) => b.avgRating - a.avgRating);
            break;
        case 'rating_asc':
            playerStats.sort((a, b) => a.avgRating - b.avgRating);
            break;
    }

    // Calculate pagination
    const totalPages = Math.ceil(playerStats.length / playersPerPage);
    const startIndex = (page - 1) * playersPerPage;
    const endIndex = startIndex + playersPerPage;
    const pagePlayers = playerStats.slice(startIndex, endIndex);

    if (page > totalPages) {
        return { embed: null, components: [], error: `Page ${page} does not exist. There are only ${totalPages} pages.` };
    }

    // Create leaderboard embed
    const sortNames = {
        'vods_desc': 'VOD Count (High to Low)',
        'vods_asc': 'VOD Count (Low to High)',
        'rating_desc': 'Average Rating (High to Low)',
        'rating_asc': 'Average Rating (Low to High)'
    };

    const embed = {
        color: 0x00ff00,
        title: `🏆 Player Leaderboard`,
        description: `**Sort:** ${sortNames[sortOption]}\n**Page:** ${page}/${totalPages}\n**Total Players:** ${playerStats.length}`,
        fields: [],
        timestamp: new Date().toISOString(),
        footer: {
            text: 'Use the buttons below to navigate between pages'
        }
    };

    // Add player entries
    let leaderboardText = '';
    for (let i = 0; i < pagePlayers.length; i++) {
        const player = pagePlayers[i];
        const rank = startIndex + i + 1;
        const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
        
        leaderboardText += `${medal} **${player.name}**\n`;
        leaderboardText += `📹 ${player.vodCount} VODs • ⭐ ${player.avgRating}/10 (${player.ratingCount} ratings)\n\n`;
    }

    if (leaderboardText) {
        embed.fields.push({
            name: '📊 Rankings',
            value: leaderboardText,
            inline: false
        });
    } else {
        embed.fields.push({
            name: '📊 Rankings',
            value: 'No players found.',
            inline: false
        });
    }

    // Create navigation buttons
    const components = [];
    if (totalPages > 1) {
        const row = new ActionRowBuilder();
        
        // Previous button
        if (page > 1) {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`leaderboard_prev_${sortOption}_${page - 1}`)
                    .setLabel('← Previous')
                    .setStyle(ButtonStyle.Primary)
            );
        }
        
        // Page indicator
        row.addComponents(
            new ButtonBuilder()
                .setCustomId('leaderboard_page_info')
                .setLabel(`${page}/${totalPages}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true)
        );
        
        // Next button
        if (page < totalPages) {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`leaderboard_next_${sortOption}_${page + 1}`)
                    .setLabel('Next →')
                    .setStyle(ButtonStyle.Primary)
            );
        }
        
        components.push(row);
    }

    return { embed, components, error: null };
}

module.exports = { generateLeaderboardEmbed };
