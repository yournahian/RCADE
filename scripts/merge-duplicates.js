const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function mergeDuplicates() {
    console.log("Starting duplicate merge...");
    const allOwnerships = await prisma.nFTOwnership.findMany({
        orderBy: { acquiredAt: 'desc' }
    });

    const groups = {};

    for (const o of allOwnerships) {
        const key = `${o.wallet.toLowerCase()}_${o.tokenId}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(o);
    }

    const mergedResults = [];

    for (const key in groups) {
        const rows = groups[key];
        if (rows.length > 1) {
            let totalAmount = 0;
            for (const r of rows) {
                totalAmount += r.amount;
            }

            const canonicalRow = rows[0];
            const duplicateIds = rows.slice(1).map(r => r.id);

            await prisma.$transaction([
                prisma.nFTOwnership.update({
                    where: { id: canonicalRow.id },
                    data: { 
                        amount: totalAmount,
                        isActive: totalAmount > 0
                    }
                }),
                prisma.nFTOwnership.deleteMany({
                    where: { id: { in: duplicateIds } }
                })
            ]);

            mergedResults.push({
                wallet: canonicalRow.wallet,
                tokenId: canonicalRow.tokenId,
                oldRows: rows.length,
                newTotal: totalAmount,
                deletedIds: duplicateIds
            });
        }
    }

    console.log(`Merged ${mergedResults.length} duplicate groups.`);
    console.log(JSON.stringify(mergedResults, null, 2));
}

mergeDuplicates().catch(console.error).finally(() => prisma.$disconnect());
