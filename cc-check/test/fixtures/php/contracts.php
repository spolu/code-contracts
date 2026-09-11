<?php

#[Service]
/**
 * @cc [owner:spolu,label:product] php-invoice-service-fixture
 * Represents a PHP service used by the CLI integration tests.
 */
final readonly class InvoiceService
{
    /**
     * @cc [owner:spolu,label:product] php-amount-fixture
     * Provides a property used to exercise nested PHP contract listing.
     */
    public int $amount;

    /**
     * @cc [owner:spolu,label:product] php-default-amount-fixture
     * Defines a class constant in the PHP fixture.
     */
    public const DEFAULT_AMOUNT = 1;

    /**
     * @cc [owner:spolu,label:product] php-constructor-fixture
     * Defines a constructor with a promoted property.
     */
    public function __CONSTRUCT(
        /**
         * @cc [owner:spolu,label:product] php-promoted-property-fixture
         * Defines a contract on a constructor-promoted property.
         */
        private string $invoiceId,
    ) {}

    /**
     * @cc [owner:spolu,label:product] php-payment-fixture
     * Provides a keyword-named method used to exercise PHP parser recovery.
     */
    /**
     * @cc [owner:spolu,label:product] php-payment-result-fixture
     * Leaves the invoice in its expected paid state.
     */
    #[Transactional]
    public static function for(string $invoiceId): self
    {
        return new self();
    }
}

/**
 * @cc [owner:spolu,label:product] php-payer-fixture
 * Represents an interface used to exercise PHP declaration listing.
 */
interface Payer
{
    /**
     * @cc [owner:spolu,label:product] php-payer-signature-fixture
     * Defines a contract on an interface method.
     */
    public function pay(): void;
}

/**
 * @cc [owner:spolu,label:product] php-shared-behavior-fixture
 * Represents a trait used to exercise PHP declaration listing.
 */
trait SharedBehavior
{
    /**
     * @cc [owner:spolu,label:product] php-helper-fixture
     * Defines a contract on a trait method.
     */
    public function helper(): void {}
}

/**
 * @cc [owner:spolu,label:product] php-state-fixture
 * Represents an enum used to exercise PHP declaration listing.
 */
enum State: string
{
    /**
     * @cc [owner:spolu,label:product] php-paid-case-fixture
     * Defines a contract on an enum case.
     */
    case Paid = "paid";
}

/**
 * @cc [owner:spolu,label:product] php-report-fixture
 * Provides a separate PHP function for whole-file listing.
 */
function reportInvoices(): void {}

/* @cc this-is-not-phpdoc */
function ignoredOrdinaryComment(): void {}
