import 'dotenv/config';
import { prisma } from '../src/lib/prisma.js';

const previews = [
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
];

async function seed() {
  const hosts = [
    {
      firebaseUid: 'seed-carolina',
      email: 'carolina@liveboom.tv',
      displayName: 'Carolina Boom',
      handle: 'carolina_boom',
      avatarUrl:
        'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&w=200&q=80',
      title: 'Noche de preguntas con la comunidad',
      coverUrl:
        'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1600&q=80',
      category: 'Lifestyle',
      isPrivate: false,
      lockPrice: 0,
      viewers: 12400,
    },
    {
      firebaseUid: 'seed-leo',
      email: 'leo@liveboom.tv',
      displayName: 'Leo Night',
      handle: 'leonight',
      avatarUrl:
        'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80',
      title: 'Set house a medianoche',
      coverUrl:
        'https://images.unsplash.com/photo-1571266028243-d220c6c2d5d2?auto=format&fit=crop&w=1200&q=80',
      category: 'Música',
      isPrivate: true,
      lockPrice: 250,
      viewers: 4100,
    },
    {
      firebaseUid: 'seed-mira',
      email: 'mira@liveboom.tv',
      displayName: 'Mira Sol',
      handle: 'mirasol',
      avatarUrl:
        'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=200&q=80',
      title: 'Makeup glow en vivo',
      coverUrl:
        'https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?auto=format&fit=crop&w=1200&q=80',
      category: 'Beauty',
      isPrivate: false,
      lockPrice: 0,
      viewers: 2800,
    },
    {
      firebaseUid: 'seed-nova',
      email: 'nova@liveboom.tv',
      displayName: 'Nova Beat',
      handle: 'novabeat',
      avatarUrl:
        'https://images.unsplash.com/photo-1527980965255-d3b416303d12?auto=format&fit=crop&w=200&q=80',
      title: 'Backstage del estudio',
      coverUrl:
        'https://images.unsplash.com/photo-1598387993441-a364f854c3e1?auto=format&fit=crop&w=1200&q=80',
      category: 'Creators',
      isPrivate: false,
      lockPrice: 0,
      viewers: 9600,
    },
  ];

  for (const [index, host] of hosts.entries()) {
    const user = await prisma.user.upsert({
      where: { firebaseUid: host.firebaseUid },
      update: { displayName: host.displayName, avatarUrl: host.avatarUrl },
      create: {
        firebaseUid: host.firebaseUid,
        email: host.email,
        displayName: host.displayName,
        handle: host.handle,
        avatarUrl: host.avatarUrl,
        coins: 0,
      },
    });

    await prisma.stream.upsert({
      where: { livekitRoom: `liveboom-${host.handle}` },
      update: {
        title: host.title,
        status: 'LIVE',
        coverUrl: host.coverUrl,
        previewUrl: previews[index] ?? previews[0]!,
        viewerCount: host.viewers,
        isPrivate: host.isPrivate,
        lockPrice: host.lockPrice,
      },
      create: {
        hostId: user.id,
        title: host.title,
        category: host.category,
        status: 'LIVE',
        isPrivate: host.isPrivate,
        lockPrice: host.lockPrice,
        coverUrl: host.coverUrl,
        previewUrl: previews[index] ?? previews[0]!,
        livekitRoom: `liveboom-${host.handle}`,
        viewerCount: host.viewers,
      },
    });
  }

  const gifts = [
    { name: 'Estrella', emoji: '⭐', price: 10, accent: 'gold' },
    { name: 'Corazón', emoji: '💖', price: 50, accent: 'fuchsia' },
    { name: 'Diamante', emoji: '💎', price: 200, accent: 'blue' },
    { name: 'Corona', emoji: '👑', price: 500, accent: 'gold' },
  ];

  for (const gift of gifts) {
    const exists = await prisma.gift.findFirst({ where: { name: gift.name } });
    if (!exists) {
      await prisma.gift.create({ data: gift });
    }
  }

  const packs = [
    { name: 'Starter', coins: 500, amountCents: 990_000, popular: false },
    { name: 'Fan', coins: 1_200, amountCents: 1_990_000, popular: false },
    { name: 'Creator', coins: 2_500, amountCents: 3_490_000, popular: true },
    { name: 'VIP', coins: 6_000, amountCents: 6_990_000, popular: false },
  ];

  for (const pack of packs) {
    const exists = await prisma.coinPackage.findFirst({ where: { name: pack.name } });
    if (!exists) {
      await prisma.coinPackage.create({ data: pack });
    }
  }

  console.log('Seed Liveboom OK');
}

seed()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
