const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

const googleOAuthConfigured = Boolean(
  process.env.GOOGLE_CLIENT_ID &&
  process.env.GOOGLE_CLIENT_SECRET &&
  process.env.GOOGLE_CALLBACK_URL
);

if (googleOAuthConfigured) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL
      },
      (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile?.emails?.[0]?.value;
          if (!email) {
            return done(new Error('Google account did not return an email address.'));
          }

          return done(null, {
            googleId: String(profile.id || ''),
            email: String(email).trim().toLowerCase(),
            name: String(profile.displayName || ''),
            avatar: String(profile?.photos?.[0]?.value || '')
          });
        } catch (error) {
          return done(error);
        }
      }
    )
  );
}

module.exports = { passport, googleOAuthConfigured };
