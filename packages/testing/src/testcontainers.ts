import { execFile } from "node:child_process";
import { createServer } from "node:net";
import { promisify } from "node:util";
import { GenericContainer, type StartedTestContainer } from "testcontainers";

const execFileAsync = promisify(execFile);

async function getFreePort() {
  return await new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Unable to determine a free port")));
        return;
      }

      const { port } = address;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

export type StartedRedis = {
  url: string;
  container: StartedTestContainer;
  stop: () => Promise<void>;
};

async function startRedisViaDocker() {
  const hostPort = process.env.REDIS_TEST_PORT ?? String(await getFreePort());
  const containerName = `quiz-redis-${Date.now()}`;

  const { stdout } = await execFileAsync("docker", ["run", "--rm", "-d", "--name", containerName, "-p", `${hostPort}:6379`, "redis:7-alpine"]);

  return {
    containerId: stdout.trim(),
    name: containerName,
    url: `redis://127.0.0.1:${hostPort}`
  };
}

export async function startRedisContainer(): Promise<StartedRedis> {
  const configuredUrl = process.env.REDIS_URL;
  if (configuredUrl) {
    return {
      url: configuredUrl,
      container: {} as StartedTestContainer,
      stop: async () => undefined
    };
  }

  try {
    const container = await new GenericContainer("redis:7-alpine").withExposedPorts(6379).start();
    const host = container.getHost();
    const port = container.getMappedPort(6379);

    return {
      url: `redis://${host}:${port}`,
      container,
      stop: async () => {
        await container.stop();
      }
    };
  } catch (error) {
    const dockerRedis = await startRedisViaDocker();

    return {
      url: dockerRedis.url,
      container: {} as StartedTestContainer,
      stop: async () => {
        await execFileAsync("docker", ["rm", "-f", dockerRedis.name]);
      }
    };
  }
}
