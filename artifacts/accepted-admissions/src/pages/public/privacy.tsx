import {
  LEGAL_EFFECTIVE_DATE,
  LegalContactLink,
  LegalList,
  LegalPage,
  LegalSection,
  LegalTextLink,
} from "@/pages/public/legal-page";

export const PRIVACY_TITLE = "Privacy Policy | Accepted Admissions";
export const PRIVACY_DESCRIPTION =
  "How Accepted Admissions collects, uses, and shares personal information for tutoring and college-admissions consulting, including Google Calendar data used only for scheduling.";

export const GOOGLE_API_USER_DATA_POLICY_URL =
  "https://developers.google.com/terms/api-services-user-data-policy";

export const GOOGLE_LIMITED_USE_SENTENCE =
  "Accepted Admissions' use and transfer of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements.";

const GOOGLE_POLICY_NAME = "Google API Services User Data Policy";

function GoogleLimitedUseStatement() {
  const parts = GOOGLE_LIMITED_USE_SENTENCE.split(GOOGLE_POLICY_NAME);
  if (parts.length !== 2 || !parts[0] || parts[1] === undefined) {
    throw new Error("Limited Use sentence no longer wraps the Google policy name");
  }
  return (
    <p data-testid="privacy-google-limited-use">
      {parts[0]}
      <a
        href={GOOGLE_API_USER_DATA_POLICY_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${GOOGLE_POLICY_NAME} (opens in a new tab)`}
        className="font-medium text-primary underline underline-offset-2"
      >
        {GOOGLE_POLICY_NAME}
      </a>
      {parts[1]}
    </p>
  );
}

export default function PrivacyPolicy() {
  return (
    <LegalPage
      testId="privacy-policy-page"
      eyebrow="Privacy Policy"
      title={PRIVACY_TITLE}
      description={PRIVACY_DESCRIPTION}
      heading="Privacy Policy"
      lede="Accepted Admissions is a tutoring and college-admissions consulting service at acceptedadmissions.org. This policy explains what we collect, how we use it, and how to ask us to delete it. It covers our public website and the client and tutor portal."
      toc={[
        { href: "#information-we-collect", label: "Information we collect" },
        { href: "#how-we-use-information", label: "How we use information" },
        { href: "#how-we-share-information", label: "How we share information" },
        { href: "#google-user-data", label: "Google user data" },
        { href: "#retention-and-deletion", label: "Retention and deletion" },
        { href: "#children-and-students", label: "Students under 18" },
        { href: "#security", label: "Security" },
        { href: "#contact", label: "Contact" },
      ]}
    >
      <LegalSection id="information-we-collect" title="Information we collect">
        <p>We collect the following information when you use Accepted Admissions:</p>
        <LegalList>
          <li>Account information when you sign in with Clerk.</li>
          <li>Name, email address, and phone number.</li>
          <li>
            Academic information you or a parent or guardian share with us, such as SAT scores, GPA, school, and target universities.
          </li>
          <li>Session bookings, including the date, time, tutor, and related scheduling details.</li>
          <li>
            Payment information processed by Stripe. We do not store your card numbers. Stripe processes the card payment.
          </li>
          <li>Quiz and homework results from work completed on the platform.</li>
          <li>
            Sessions may be recorded and transcribed with AI-assisted tools only with the client’s explicit consent. A third-party meeting or transcription provider may process those recordings and transcriptions. Notes from those sessions are shared back with the client and used solely for that client’s tutoring.
          </li>
        </LegalList>
        <p>
          The same contact and academic details may also arrive through a guidance request on this website. Please do not send passwords or payment card numbers in a form or email.
        </p>
      </LegalSection>

      <LegalSection id="how-we-use-information" title="How we use information">
        <p>We use this information to run the service you asked for:</p>
        <LegalList>
          <li>Create and manage accounts.</li>
          <li>Schedule and deliver tutoring and college-admissions consulting.</li>
          <li>Process prepaid credits and payments.</li>
          <li>Prepare quizzes, homework, and session notes for the student.</li>
          <li>Respond to guidance requests.</li>
          <li>Keep the service secure and fix problems.</li>
          <li>Communicate with you about your account, bookings, and the service.</li>
        </LegalList>
        <p>We do not sell personal information.</p>
      </LegalSection>

      <LegalSection id="how-we-share-information" title="How we share information">
        <p>
          We share information only with service providers needed to run the service, such as hosting, payments, authentication, calendar, email, and AI service providers. Those providers include Stripe for payments, Clerk for sign-in, Google when a tutor connects a calendar, our email and hosting providers, and OpenAI when practice questions are drafted. They may process information only to perform those services for us.
        </p>
        <p>
          AI question generation may run when a tutor, administrator, or student requests practice material. Question generation does not send the student’s name, email, account, or scores. The request sent to the AI service provider is the subject, skill, difficulty, number of questions, and any source text included with that request. Analogous practice items are drafted from the skill and difficulty of an existing question, not from a student’s identity.
        </p>
        <p>
          We may also share information if the law requires it, or when it is needed to protect the rights, safety, and integrity of our clients, tutors, and the service.
        </p>
        <p>We never sell personal information.</p>
      </LegalSection>

      <LegalSection id="google-user-data" title="Google user data">
        <p>
          Tutors can connect Google Calendar so the platform can read free/busy availability and create, update, and delete session events. The connection uses the Google scopes openid, email, calendar.freebusy, and calendar.events. We receive the Google account email to match it to the tutor’s portal account. Those events can include Google Meet links and attendees. We read and update the guest lists of events the platform creates, for example by adding the business’s admin address. Google emails calendar invites to guests for SAT sessions. A tutor chooses to connect. We do not receive that tutor’s Google Calendar data unless they connect.
        </p>
        <p>
          Google data is used only to provide scheduling. It is not sold. It is not used for advertising. It is not used to train AI models.
        </p>
        <p>
          Tokens are stored encrypted. A tutor can revoke access at any time via their Google Account permissions, or by disconnecting Google Calendar in the portal. Disconnecting deletes the stored tokens.
        </p>
        <GoogleLimitedUseStatement />
      </LegalSection>

      <LegalSection id="retention-and-deletion" title="Retention and deletion">
        <p>
          We keep information for as long as we need it to provide the service, meet legal and accounting duties, resolve disputes, and keep a record of sessions and payments. When we no longer need it, we delete it or de-identify it.
        </p>
        <p>
          You may request deletion of personal information by emailing <LegalContactLink />. We will honor a request that we can complete without breaking a legal duty, an active payment record, or another person’s rights. A parent or guardian may make this request for a student under 18.
        </p>
      </LegalSection>

      <LegalSection id="children-and-students" title="Children and students under 18">
        <p>
          Accepted Admissions works with students, including students under 18. If a student is under 18, a parent or guardian should create or authorize the account and consent on the student’s behalf. Parents and guardians can contact us to review that information or to ask us to delete it.
        </p>
      </LegalSection>

      <LegalSection id="security" title="Security">
        <p>
          We use administrative and technical safeguards designed to protect personal information. Google Calendar tokens are stored encrypted. Card payments are handled by Stripe, and we do not store card numbers. No method of transmission or storage is completely secure.
        </p>
      </LegalSection>

      <LegalSection id="contact" title="Contact">
        <p>
          Questions about this policy, and requests to access or delete information, can be sent to <LegalContactLink testId="link-privacy-contact" />.
        </p>
        <p>
          Accepted Admissions · acceptedadmissions.org · Effective {LEGAL_EFFECTIVE_DATE}
        </p>
        <p>
          See also our <LegalTextLink href="/terms">Terms of Service</LegalTextLink>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
