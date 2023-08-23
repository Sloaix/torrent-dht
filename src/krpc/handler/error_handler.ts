import { MessageHandler } from '~/src/krpc/krpc.ts'
import TranscationManager from '~/src/krpc/transcation_manager.ts'
import { Message, MessageType } from '~/src/message_factory.ts'
import logger from '~/src/util/log.ts'
import Sender from '~/src/krpc/sender.ts'

export default class ErrorResponseHandler implements MessageHandler {
  #sender!: Sender
  getHandleMessageType(): MessageType {
    return MessageType.ERROR
  }

  handle(response: Message, address: string, port: number, client: Sender): Promise<void> {
    logger.warn(`[<======ERROR] received invalid error from ${address}:${port}`)

    if (!this.#sender) {
      this.#sender = client
    }

    const { e: error, t: tid } = response

    if (!tid || TranscationManager.get().isValid(tid)) {
      logger.warn(`[${tid}] received invalid error from ${address}:${port}`)
      return Promise.resolve()
    }

    // finish transcation
    TranscationManager.get().finish(tid)

    const [errorCode, errorMessage] = error

    logger.error(`[${tid}] received error from ${address}:${port}: ${errorCode} ${errorMessage}`)

    return Promise.resolve()
  }
}
