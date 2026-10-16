import {
  LEGAL_EFFECTIVE_DATE,
  LegalContactLink,
  LegalList,
  LegalPage,
  LegalSection,
  LegalTextLink,
} from "@/pages/public/legal-page";

export const TERMS_TITLE = "Terms of Service | Accepted Admissions";
export const TERMS_DESCRIPTION =
  "Terms for using Accepted Admissions tutoring and college-admissions consulting, including accounts, prepaid hourly credits, and session bookings.";

export default function TermsOfService() {
  return (
    <LegalPage
      testId="terms-of-service-page"
      eyebrow="Terms of Service"
      title={TERMS_TITLE}
      description={TERMS_DESCRIPTION}
      heading="Terms of Service"
      lede="These terms cover the Accepted Admissions website, client portal, and related tutoring and college-admissions consulting at acceptedadmissions.org. By creating an account, booking a session, buying credits, or using the site, you agree to these terms. If you are a parent or guardian arranging services for a student, you agree on that student’s behalf."
      toc={[
        { href: "#services", label: "Services" },
        { href: "#accounts", label: "Accounts" },
        { href: "#bookings-and-payments", label: "Bookings and payments" },
        { href: "#cancellation-and-rescheduling", label: "Cancellation and refunds" },
        { href: "#no-guarantee", label: "No guarantee of outcomes" },
        { href: "#acceptable-use", label: "Acceptable use" },
        { href: "#intellectual-property", label: "Intellectual property" },
        { href: "#limitation-of-liability", label: "Limitation of liability" },
        { href: "#governing-law", label: "Governing law" },
        { href: "#severability", label: "Severability" },
        { href: "#changes", label: "Changes" },
        { href: "#contact", label: "Contact" },
      ]}
    >
      <LegalSection id="services" title="Services">
        <p>
          Accepted Admissions provides tutoring and college-admissions consulting. Current offerings include SAT tutoring and private guidance. The service, tutor, and schedule are confirmed when a session is booked or a guidance request is accepted. We may decline a request when we are not the right fit.
        </p>
        <p>
          Public pages describe the service. Prices for self-serve booking are shown in the signed-in portal before you pay.
        </p>
      </LegalSection>

      <LegalSection id="accounts" title="Accounts">
        <p>
          Portal sign-in is provided by Clerk. You are responsible for activity on your account and for keeping your sign-in private. Accounts are for the named client, student, parent or guardian, or tutor. Do not share portal access with someone outside that engagement.
        </p>
      </LegalSection>

      <LegalSection id="bookings-and-payments" title="Bookings and payments">
        <p>
          Some sessions are booked with prepaid hourly credits purchased through Stripe. You buy credits in advance, and a credit is used when a session hour is booked. The price is shown before you pay. Accepted Admissions does not store card numbers. Stripe processes the payment. Unused credits are refundable only before that client’s first tutoring session, and they are non-refundable after it, including credits bought later. Unused credits carry over when a session is rescheduled. Rescheduling or cancellation needs at least 24 hours’ notice through the portal.
        </p>
        <p>
          Other engagements may be arranged outside self-serve checkout. Those arrangements are confirmed separately. Visiting the public site does not by itself create a booking or a charge.
        </p>
      </LegalSection>

      <LegalSection id="cancellation-and-rescheduling" title="Cancellation, rescheduling, and refunds">
        <p>
          Before a client’s first tutoring session takes place, they may request a refund of unused prepaid credits by emailing <LegalContactLink />.
        </p>
        <p>
          Once that client’s first tutoring session has taken place, all purchases are non-refundable. That includes the original purchase and any later credit purchases.
        </p>
        <p>Unused credits remain available for rescheduled sessions.</p>
        <p>
          Please reschedule or cancel at least 24 hours in advance through the portal. When you do, the credit is kept for a future session. A late cancellation or a no-show may forfeit that session credit, at Accepted Admissions’ discretion.
        </p>
        <p>Nothing in this policy limits any rights consumers have under applicable law.</p>
      </LegalSection>

      <LegalSection id="no-guarantee" title="No guarantee of admissions outcomes or scores">
        <p>
          Tutoring and consulting are educational services. Accepted Admissions does not guarantee admission to any university, a particular SAT or other test score, a scholarship, or any other academic or admissions result. Progress depends on the student, the work completed, and factors outside our control.
        </p>
      </LegalSection>

      <LegalSection id="acceptable-use" title="Acceptable use">
        <p>You agree to use the site and portal only for the engagement you have with us. You will not:</p>
        <LegalList>
          <li>Share an account or try to open someone else’s account or data.</li>
          <li>Interfere with the site, a session, or another person’s use of the service.</li>
          <li>Upload unlawful, harmful, or misleading content.</li>
          <li>Copy or redistribute our materials, or third-party materials we provide, outside the engagement.</li>
        </LegalList>
      </LegalSection>

      <LegalSection id="intellectual-property" title="Intellectual property">
        <p>
          Accepted Admissions and its tutors keep the intellectual property rights in original materials, curricula, notes, and site content we provide. You receive a limited right to use those materials for the student’s own tutoring and admissions preparation. That right does not include republishing, selling, or sharing them publicly.
        </p>
        <p>
          Materials you provide to us stay yours. You give us permission to use them to deliver the service. Third-party materials, including practice content from other owners, stay subject to those owners’ rights.
        </p>
      </LegalSection>

      <LegalSection id="limitation-of-liability" title="Limitation of liability">
        <p>
          To the fullest extent the law allows, Accepted Admissions is not liable for indirect, incidental, special, or consequential damages, or for lost opportunities, admissions results, or test scores. Our total liability for a claim arising out of the service is limited to the amount you paid us for the service that gave rise to the claim during the three months before the claim.
        </p>
        <p>
          Some places do not allow these limits. Where that is the case, our liability is limited to the extent the law allows.
        </p>
      </LegalSection>

      <LegalSection id="governing-law" title="Governing law">
        <p>
          These terms are governed by the laws of the State of New Jersey, without regard to conflict-of-law principles.
        </p>
        <p>
          Disputes go exclusively to the state and federal courts located in New Jersey. You and Accepted Admissions consent to personal jurisdiction there.
        </p>
        <p>
          Before filing, both sides agree to try in good faith to resolve the dispute informally for 30 days after written notice to <LegalContactLink />.
        </p>
      </LegalSection>

      <LegalSection id="severability" title="Severability">
        <p>
          If a court finds that one part of these terms cannot be enforced, the rest of the terms still apply. That part is limited only as far as needed to make it valid, or it is removed if it cannot be limited.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="Changes to these terms">
        <p>
          We may update these terms. When we do, we change the effective date at the top of this page and post the new version here. The current effective date is {LEGAL_EFFECTIVE_DATE}. Continuing to use the service after an update means you accept the revised terms.
        </p>
      </LegalSection>

      <LegalSection id="contact" title="Contact">
        <p>
          Questions about these terms can be sent to <LegalContactLink testId="link-terms-contact" />.
        </p>
        <p>
          See also our <LegalTextLink href="/privacy">Privacy Policy</LegalTextLink>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
