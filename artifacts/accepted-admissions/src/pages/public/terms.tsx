import {
  LEGAL_EFFECTIVE_DATE,
  LegalContactLink,
  LegalList,
  LegalPage,
  LegalPlaceholder,
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
        { href: "#cancellation-and-rescheduling", label: "Cancellation" },
        { href: "#no-guarantee", label: "No guarantee of outcomes" },
        { href: "#acceptable-use", label: "Acceptable use" },
        { href: "#intellectual-property", label: "Intellectual property" },
        { href: "#limitation-of-liability", label: "Limitation of liability" },
        { href: "#governing-law", label: "Governing law" },
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
          Some sessions are booked with prepaid hourly credits purchased through Stripe. You buy credits in advance, and a credit is used when a session hour is booked. The price is shown before you pay. Accepted Admissions does not store card numbers. Stripe processes the payment.
        </p>
        <p>
          Other engagements may be arranged outside self-serve checkout. Those arrangements are confirmed separately. Visiting the public site does not by itself create a booking or a charge.
        </p>
      </LegalSection>

      <LegalPlaceholder
        id="cancellation-and-rescheduling"
        testId="terms-cancellation-placeholder"
        title="Cancellation and rescheduling"
      >
        <p>
          Contact <LegalContactLink /> before a session if you need to cancel or reschedule it.
        </p>
        <p>
          This section is a placeholder. The notice period, whether a prepaid credit is restored, and whether a payment is refunded are not set in these terms yet. It is not a promise that a credit will be returned or that a charge will be refunded. The owner will replace this section with the final cancellation and rescheduling rules.
        </p>
      </LegalPlaceholder>

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

      <LegalPlaceholder id="governing-law" testId="terms-governing-law-placeholder" title="Governing law">
        <p>
          This section is a placeholder for the owner to fill in. These terms do not name a governing law, venue, or court. No jurisdiction is stated here. The owner of Accepted Admissions will replace this section with the law and courts that apply.
        </p>
        <p>
          Until that update is published, questions about these terms can be sent to <LegalContactLink />.
        </p>
      </LegalPlaceholder>

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
