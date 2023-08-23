import Logger from 'logger'
import { join } from 'std/path/join.ts'

const PROJECT_ROOT = Deno.cwd()
const LOG_DIR = join(PROJECT_ROOT, 'logs')
const NAME = 'torrent-dht'

/**
 * Logger
 * @param name name of the logger
 */
async function getLogger(name: string) {
  const logger = new Logger()

  // init file logger
  await logger.initFileLogger(join(LOG_DIR, name), {
    rotate: true
  })

  return logger
}

const logger = await getLogger(NAME)

logger.disableFile()

export default logger
