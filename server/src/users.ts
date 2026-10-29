/** Everything the app may know about a person (never the password hash). Shared by all routes. */
export const USER_COLUMNS = `id, name, email, title, phone, bio,
  email_verified AS "emailVerified", phone_verified AS "phoneVerified", created_at AS "createdAt"`
