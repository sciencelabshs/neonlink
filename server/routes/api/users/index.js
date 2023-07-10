import { requireVisitor, requireSession } from "../../../logics/handlers.js";
import {
  createUser,
  isPasswordValid,
  loadUserSettings,
  loginUser,
  logoutUser,
  setSessionCookie,
  updatePassword,
} from "../../../logics/users.js";
import { appContext } from "../../../contexts/appContext.js";
import { appRequestsKeys } from "../../../contexts/appRequests.js";
import { appSettingsKeys } from "../../../contexts/appSettings.js";

const settingsFields = {
  maxNumberOfLinks: { type: "number" },
  linkInNewTab: { type: "boolean" },
  useBgImage: { type: "boolean" },
  bgImage: { type: "string" },
  columns: { type: "number" },
  cardStyle: { type: "string" },
  enableNeonShadows: { type: "boolean" },
  cardPosition: { type: "string" },
};

export default async function (fastify, opts) {
  fastify.get(
    "/me",
    {
      preHandler: requireSession(false, true, false),
      schema: {
        response: {
          200: {
            type: "object",
            properties: {
              id: { type: "number" },
              username: { type: "string" },
              isAdmin: { type: "number" },
              ...settingsFields,
            }
          }
        }
      }
    },
    async (request, reply) => {
      const session = appContext.request.get(appRequestsKeys.Session);
      const settings = session.authenticated ? loadUserSettings(session.userId) : {};
      return { id: session.userId, username: session.username, ...settings };
    }
  );

  fastify.post(
    "/",
    {
      schema: {
        body: {
          type: "object",
          required: ["username", "password"],
          properties: {
            username: { type: "string" },
            password: { type: "string" },
          }
        }
      }
    },
    function (request) {
      let { username, password } = request.body;
      if (!appContext.settings.get(appSettingsKeys.UserRegistrationEnabled))
        throw fastify.httpErrors.notAcceptable("User registration disabled.");
      if (appContext.stores.users.checkWhetherUserExists(username))
        throw fastify.httpErrors.notAcceptable("This username already exist");
      return createUser(
        username,
        password,
        appContext.stores.users.checkWhetherTableIsEmpty()
      );
    }
  );

  fastify.put(
    "/changePassword",
    {
      preHandler: requireSession(false, true, false),
      schema: {
        body: {
          type: "object",
          required: ["username", "currentPassword", "newPassword"],
          properties: {
            username: { type: "string" },
            currentPassword: { type: "string" },
            newPassword: { type: "string" },
          }
        }
      }
    },
    async function (request) {
      let { currentPassword, newPassword } = request.body;
      const session = appContext.request.get("session");

      let isValid = await isPasswordValid(session.userId, currentPassword);
      if (isValid === false) {
        throw fastify.httpErrors.forbidden("Password is incorrect");
      } else {
        updatePassword(session.userId, newPassword);
        return true;
      }
    }
  );

  fastify.delete(
    "/",
    { preHandler: requireSession(false, true, false) },
    async function (request, reply) {
      const session = appContext.request.get(appRequestsKeys.Session);
      if (appContext.stores.users.deleteUser(session.sessionId))
        return { status: "OK" };
      else throw fastify.httpErrors.notFound("User with this id is not found");
    }
  );

  fastify.post(
    "/login",
    {
      requireSession: requireVisitor(false),
      schema: {
        body: {
          type: "object",
          required: ["username", "password"],
          properties: {
            username: { type: "string" },
            password: { type: "string" },
          }
        }
      }
    },
    function (request, reply) {
      const { username, password } = request.body;
      const data = loginUser(username, password);
      if (data) {
        setSessionCookie(reply, data.sessionId);
      } else {
        throw reply.forbidden("Username or password is incorrect");
      }
      return data;
    }
  );

  fastify.post(
    "/logout",
    { preHandler: requireVisitor(false, true, false) },
    async function (request, reply) {
      const res = logoutUser(reply);
      if (res) {
        setSessionCookie(reply);
      }
      return res;
    }
  );
}
