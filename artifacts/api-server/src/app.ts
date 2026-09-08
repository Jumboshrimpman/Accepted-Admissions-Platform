import express, { type Express } from "express";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import router from "./routes";
import { resolveClerkPublishableKey } from "./lib/clerk-publishable-key";
import { logger } from "./lib/logger";
import { canonicalRequestHostMiddleware } from "./middlewares/canonicalRequestHost";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
} from "./middlewares/clerkProxyMiddleware";
import { processStripeWebhook } from "./lib/payment-service";
import { constructVerifiedStripeEvent } from "./lib/stripe-client";
import { PRODUCTION_STRIPE_WEBHOOK_PATH } from "./lib/stripe-webhook-url";

const app: Express = express();

app.set("trust proxy", 1);
app.use(canonicalRequestHostMiddleware());
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
  PRODUCTION_STRIPE_WEBHOOK_PATH,
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
      try {
        await processStripeWebhook(event);
      } catch (error) {
        req.log?.warn({ err: error }, "Stripe webhook processing failed");
        const message = error instanceof Error ? error.message : "Stripe webhook could not be processed";
        res.status(500).json({ error: message });
        return;
      }
      res.status(200).json({ received: true });
    } catch (error) {
      req.log?.warn({ err: error }, "Stripe webhook rejected or failed");
      res.status(400).json({ error: "Stripe webhook could not be verified" });
    }
  },
);
app.use(express.json({ limit: "3mb" }));
app.use(express.urlencoded({ extended: true, limit: "3mb" }));
app.use(
  clerkMiddleware(() => {
    const clerkPublishableKeyResult = resolveClerkPublishableKey(
      process.env.CLERK_PUBLISHABLE_KEY,
    );
    if (!clerkPublishableKeyResult.ok) {
      return {};
    }
    return {
      publishableKey: clerkPublishableKeyResult.publishableKey,
    };
  }),
);

app.use("/api", router);

export default app;
