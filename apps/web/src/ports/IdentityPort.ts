export interface IdentityPort {
  getMyEmail(): string | null
  getMyDisplayName(): string | null
}
