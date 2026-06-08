import { create } from 'zustand'
import type { Skill, ISkillRepository } from '../infrastructure/skills/types'
import { LocalSkillRepository } from '../infrastructure/skills/localSkillRepository'
import { ServerSkillRepository } from '../infrastructure/skills/serverSkillRepository'
import { Features } from '../config/features'

function createRepository(): ISkillRepository {
  return Features.webSubmission
    ? new ServerSkillRepository()
    : new LocalSkillRepository()
}

interface SkillState {
  skills:       Skill[]
  activeSkills: Skill[]
  loaded:       boolean
  load():                       Promise<void>
  save(skill: Skill):           Promise<void>
  delete(slug: string):         Promise<void>
  resetToBuiltin(slug: string): Promise<void>
}

const repo = createRepository()

export const useSkillStore = create<SkillState>((set) => ({
  skills:       [],
  activeSkills: [],
  loaded:       false,

  async load() {
    const skills = await repo.list()
    set({ skills, activeSkills: skills.filter(s => s.status === 'active'), loaded: true })
  },

  async save(skill) {
    await repo.save(skill)
    const skills = await repo.list()
    set({ skills, activeSkills: skills.filter(s => s.status === 'active') })
  },

  async delete(slug) {
    await repo.delete(slug)
    const skills = await repo.list()
    set({ skills, activeSkills: skills.filter(s => s.status === 'active') })
  },

  async resetToBuiltin(slug) {
    await repo.resetToBuiltin(slug)
    const skills = await repo.list()
    set({ skills, activeSkills: skills.filter(s => s.status === 'active') })
  },
}))
