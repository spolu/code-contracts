package fixture

// @cc [owner:spolu,label:product] go-invoice-fixture
// Represents a Go invoice used by the CLI integration tests.
type Invoice struct {
	// @cc [owner:spolu,label:product] go-amount-fixture
	// Provides a field used to exercise nested Go contract listing.
	Amount int
}

/*
 * @cc [owner:spolu,label:product] go-payment-fixture
 * Provides a method used to exercise receiver contract listing.
 */
/*
 * @cc [owner:spolu,label:product] go-payment-result-fixture
 * Leaves the invoice in its expected paid state.
 */
func (invoice *Invoice) Pay() {}

// @cc [owner:spolu,label:product] go-report-fixture
// Provides a separate Go declaration for whole-file listing.
func reportInvoices() {}

const (
	// @cc [owner:spolu,label:product] go-default-amount-fixture
	// Defines a constant inside a grouped declaration.
	DefaultAmount = 1
)

type Payer interface {
	// @cc [owner:spolu,label:product] go-payer-signature-fixture
	// Defines a contract on an interface method.
	Pay()
}
