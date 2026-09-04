import express, { type Express } from "express";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import router from "./routes";
import { logger } from "./lib/logger";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import { processStripeWebhook } from "./lib/payment-service";
import { constructVerifiedStripeEvent } from "./lib/stripe-client";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res): Promise<void> => {
    const signature = req.header("stripe-signature");
    if (!signature) {
      res.status(400).json({ error: "Missing Stripe signature" });
      return;
    }
    try {
      if (!Buffer.isBuffer(req.body)) {
        res.status(400).json({ error: "Stripe webhook body must be raw bytes" });
        return;
      }
      const event = constructVerifiedStripeEvent(req.body, signature);
      await processStripeWebhook(event);
      res.status(200).json({ received: true });
    } catch (error) {
      req.log?.warn({ err: error }, "Stripe webhook rejected or failed");
      res.status(400).json({ error: "Stripe webhook could not be verified" });
    }
  },
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

export default app;
