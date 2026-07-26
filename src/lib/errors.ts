// Maps Firebase (auth/firestore/functions) error codes to messages fit for end users.
export function friendlyError(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const code = typeof (err as any)?.code === 'string' ? ((err as any).code as string) : ''
  const bare = code.replace(/^functions\//, '')

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return 'Incorrect email or password.'
    case 'auth/too-many-requests':
      return 'Too many attempts — please wait a moment and try again.'
    case 'auth/network-request-failed':
      return 'Network problem — check your internet connection.'
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.'
    case 'auth/weak-password':
      return 'Please choose a stronger password (at least 6 characters).'
  }

  switch (bare) {
    case 'permission-denied':
      return "You don't have permission to do that."
    case 'unauthenticated':
      return 'Please sign in again to continue.'
    case 'unavailable':
      return 'Network problem — check your internet connection.'
    case 'resource-exhausted':
      return 'The service is busy right now — please try again shortly.'
    case 'failed-precondition':
      return 'That action is not available right now.'
    case 'deadline-exceeded':
      return 'The request timed out — please try again.'
    case 'not-found':
      return 'The requested item no longer exists.'
  }

  return fallback
}
