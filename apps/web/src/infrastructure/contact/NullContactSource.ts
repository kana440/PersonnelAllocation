import type { ContactSourcePort } from '../../ports/ContactSourcePort'
import type { ContactRecord } from '../../ports/contactTypes'

export class NullContactSource implements ContactSourcePort {
  isAvailable(): boolean { return false }
  isWritable():  boolean { return false }
  async readAll():                        Promise<ContactRecord[]>    { return [] }
  async readOne(_id: string):             Promise<ContactRecord|null> { return null }
  async writeRecord(_r: ContactRecord):   Promise<void>              {}
}
