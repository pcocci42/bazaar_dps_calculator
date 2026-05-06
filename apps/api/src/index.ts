import Fastify from "fastify";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import {
  simulateBoardRequest,
  type SimulateBoardRequest,
} from "./sim/simulate-board-request.js";


dotenv.config();

const app = Fastify({
  logger: true,
});

const prisma = new PrismaClient();

app.get("/health", async () => {
  return {
    status: "ok",
    service: "bazaar-dps-api",
  };
});

app.get<{
  Querystring: {
    q?: string;
    source?: string;
    limit?: string;
  };
}>("/cards/search", async (request) => {
  const q = request.query.q?.trim();
  const source = request.query.source ?? "MOBALYTICS";
  const limit = Math.min(Math.max(Number(request.query.limit ?? 20), 1), 50);

  const cards = await prisma.card.findMany({
    where: {
      source,
      ...(q
        ? {
            name: {
              contains: q,
              mode: "insensitive",
            },
          }
        : {}),
    },
    include: {
      tiers: {
        orderBy: {
          tier: "asc",
        },
        select: {
          tier: true,
          cooldown: true,
          ammo: true,
          multicast: true,
          critChance: true,
          damage: true,
          shield: true,
          heal: true,
          burn: true,
          poison: true,
          regen: true,
        },
      },
    },
    orderBy: {
      name: "asc",
    },
    take: limit,
  });

  return {
    source,
    count: cards.length,
    cards: cards.map((card) => ({
      id: card.id,
      name: card.name,
      hero: card.hero,
      type: card.type,
      size: card.size,
      tiers: card.tiers,
    })),
  };
});

app.post<{
  Body: SimulateBoardRequest;
}>("/sim/simulate", async (request, reply) => {
  try {
    return await simulateBoardRequest(request.body, { prisma });
  } catch (error) {
    request.log.error(error);

    return reply.status(400).send({
      error: "SIMULATION_REQUEST_FAILED",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

const shutdown = async () => {
  await prisma.$disconnect();
  await app.close();
};

process.on("SIGINT", () => {
  shutdown()
    .then(() => process.exit(0))
    .catch((error) => {
      app.log.error(error);
      process.exit(1);
    });
});

process.on("SIGTERM", () => {
  shutdown()
    .then(() => process.exit(0))
    .catch((error) => {
      app.log.error(error);
      process.exit(1);
    });
});

const port = Number(process.env.PORT ?? 3000);

app.listen({ port, host: "0.0.0.0" }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
