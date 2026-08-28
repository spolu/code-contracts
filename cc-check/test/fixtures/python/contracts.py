class Invoice:
    """
    @cc [author:spolu,label:product] python-invoice-fixture
    Represents a Python invoice used by the CLI integration tests.
    """

    def pay(self) -> None:
        r"""@cc [author:spolu,label:product] python-payment-fixture
        Provides a method used to exercise nested Python contract listing.
        """
        return None


def report_invoices() -> None:
    """
    @cc [author:spolu,label:product] python-report-fixture
    Provides a separate Python declaration for whole-file listing.
    """
    return None
