import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;

        // The id is the tokenId
        const reward = await prisma.reward.findFirst({
            where: { tokenId: id }
        });

        if (!reward) {
            return NextResponse.json({ error: 'Token not found' }, { status: 404 });
        }

        const levelNum = reward.levelId.split('-').pop() || '1';

        // Return standard ERC1155 JSON metadata
        // For MVP, we use generated API metadata, ready for future IPFS migration.
        return NextResponse.json({
            name: `RCADE ${reward.rarity} - Level ${levelNum}`,
            description: `A ${reward.rarity} achievement NFT for clearing level ${levelNum} in ${reward.season}.`,
            image: `https://rcade.com/assets/nfts/${reward.season}/${reward.rarity.toLowerCase()}.png`, // Placeholder
            attributes: [
                { trait_type: "Season", value: reward.season },
                { trait_type: "Level", value: levelNum },
                { trait_type: "Rarity", value: reward.rarity },
                { display_type: "number", trait_type: "Completion Rank", value: reward.completionRank }
            ]
        });
    } catch (error) {
        console.error("Failed to fetch metadata", error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
