//! @cc [author:spolu,label:product] rust-module-fixture
//! Documents a Rust module contract that is checked without declaration attachment.

/**
 * @cc [author:spolu,label:product] rust-account-fixture
 * Represents a Rust account used by the CLI integration tests.
 */
pub struct Account {
    /// @cc [author:spolu,label:product] rust-balance-fixture
    /// Provides a named field used to exercise nested Rust contract listing.
    balance: i64,
}

/// @cc [author:spolu,label:product] rust-account-impl-fixture
/// Defines behavior shared by methods in this account implementation.
impl Account {
    /// @cc [author:spolu,label:product] rust-payment-fixture
    /// Provides a method used to exercise implemented-type contract listing.
    #[must_use]
    pub fn pay(&mut self, amount: i64) -> i64 {
        self.balance -= amount;
        self.balance
    }
}

/// @cc [author:spolu,label:product] rust-state-fixture
/// Represents a separate Rust declaration for whole-file listing.
pub enum State {
    #[allow(dead_code)]
    /// @cc [author:spolu,label:product] rust-paid-variant-fixture
    /// Defines a contract on an attributed enum variant.
    Paid,
}

/// @cc [author:spolu,label:product] rust-payer-fixture
/// Defines a trait whose members can carry contracts.
pub trait Payer {
    /// @cc [author:spolu,label:product] rust-payer-signature-fixture
    /// Defines a contract on a trait method signature.
    fn pay(&mut self, amount: i64) -> i64;
}

/// @cc [author:spolu,label:product] rust-default-amount-fixture
/// Defines a constant item contract.
pub const DEFAULT_AMOUNT: i64 = 1;
