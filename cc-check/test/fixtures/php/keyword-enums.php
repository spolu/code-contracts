<?php

/**
 * @cc [owner:spolu,label:product] php-keyword-state-fixture
 * Represents a backed enum with a keyword-named case.
 */
enum KeywordState: string
{
    /**
     * @cc [owner:spolu,label:product] php-new-case-fixture
     * Preserves the name and scope of a keyword-named enum case.
     */
    case New = 'new';

    /**
     * @cc [owner:spolu,label:product] php-pending-case-fixture
     * Remains discoverable after a keyword-named enum case.
     */
    case Pending = 'pending';
}

/**
 * @cc [owner:spolu,label:product] php-keyword-option-fixture
 * Represents a pure enum with a keyword-named case.
 */
enum KeywordOption
{
    /**
     * @cc [owner:spolu,label:product] php-default-case-fixture
     * Preserves the name of a keyword-named pure enum case.
     */
    case Default;
}
