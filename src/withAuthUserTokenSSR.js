import createAuthUser from 'src/createAuthUser'
import { getCookie } from 'src/cookies'
import { verifyIdToken } from 'src/firebaseAdmin'
import {
  getAuthUserCookieName,
  getAuthUserTokensCookieName,
} from 'src/authCookies'
import { getConfig } from 'src/config'
import AuthAction from 'src/AuthAction'

/**
 * An wrapper for a page's exported getServerSideProps that
 * provides the authed user's info as a prop. Optionally,
 * this handles redirects based on auth status.
 * See this discussion on how best to use getServerSideProps
 * with a higher-order component pattern:
 * https://github.com/vercel/next.js/discussions/10925#discussioncomment-12471
 * @param {String} whenAuthed - The behavior to take if the user
 *   *is* authenticated. One of AuthAction.RENDER or
 *   AuthAction.REDIRECT_TO_APP. Defaults to AuthAction.RENDER.
 * @param {String} whenUnauthed - The behavior to take if the user
 *   is not authenticated. One of AuthAction.RENDER or
 *   AuthAction.REDIRECT_TO_LOGIN. Defaults to AuthAction.RENDER.
 * @param {String} appPageURL - The redirect destination URL when
 *   we redirect to the app.
 * @param {String} authPageURL - The redirect destination URL when
 *   we redirect to the login page.
 * @return {Object} response
 * @return {Object} response.props - The server-side props
 * @return {Object} response.props.AuthUser
 */
const withAuthUserTokenSSR = (
  {
    whenAuthed = AuthAction.RENDER,
    whenUnauthed = AuthAction.RENDER,
    appPageURL = null,
    authPageURL = null,
  } = {},
  { useToken = true } = {}
) => (getServerSidePropsFunc) => async (ctx) => {
  const { req, res } = ctx

  const { keys, secure, signed } = getConfig().cookies

  let AuthUser

  // Get the user either from:
  // * the ID token, refreshing the token as needed (via a network
  //   request), which will make `AuthUser.getIdToken` resolve to
  //   a valid ID token value
  // * the "AuthUser" cookie (no network request), which will make
  //  `AuthUser.getIdToken` resolve to null
  if (useToken) {
    // Get the user's ID token from a cookie, verify it (refreshing
    // as needed), and return the serialized AuthUser in props.
    const cookieValStr = getCookie(
      getAuthUserTokensCookieName(),
      {
        req,
        res,
      },
      { keys, secure, signed }
    )
    const { idToken, refreshToken } = cookieValStr
      ? JSON.parse(cookieValStr)
      : {}
    if (idToken) {
      AuthUser = await verifyIdToken(idToken, refreshToken)
    } else {
      AuthUser = createAuthUser() // unauthenticated AuthUser
    }
  } else {
    // Get the user's info from a cookie, verify it (refreshing
    // as needed), and return the serialized AuthUser in props.
    const cookieValStr = getCookie(
      getAuthUserCookieName(),
      {
        req,
        res,
      },
      { keys, secure, signed }
    )
    AuthUser = createAuthUser({
      serializedAuthUser: cookieValStr,
    })
  }
  const AuthUserSerialized = AuthUser.serialize()

  // If specified, redirect to the login page if the user is unauthed.
  if (!AuthUser.id && whenUnauthed === AuthAction.REDIRECT_TO_LOGIN) {
    const authRedirectDestination = authPageURL || getConfig().authPageURL
    if (!authRedirectDestination) {
      throw new Error(
        `When "whenUnauthed" is set to AuthAction.REDIRECT_TO_LOGIN, "authPageURL" must be set.`
      )
    }
    return {
      redirect: { destination: authRedirectDestination, permanent: false },
    }
  }

  // If specified, redirect to the app page if the user is authed.
  if (AuthUser.id && whenAuthed === AuthAction.REDIRECT_TO_APP) {
    const appRedirectDestination = appPageURL || getConfig().appPageURL
    if (!appRedirectDestination) {
      throw new Error(
        `When "whenAuthed" is set to AuthAction.REDIRECT_TO_APP, "appPageURL" must be set.`
      )
    }
    return {
      redirect: { destination: appRedirectDestination, permanent: false },
    }
  }

  // Evaluate the composed getServerSideProps().
  let composedProps = {}
  if (getServerSidePropsFunc) {
    // Add the AuthUser to Next.js context so pages can use
    // it in `getServerSideProps`, if needed.
    ctx.AuthUser = AuthUser
    composedProps = await getServerSidePropsFunc(ctx)
  }
  return {
    props: {
      AuthUserSerialized,
      ...composedProps,
    },
  }
}

export default withAuthUserTokenSSR
