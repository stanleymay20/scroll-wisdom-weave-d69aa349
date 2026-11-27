package org.scrolllibrary.beta;

import static org.junit.Assert.*;

import org.junit.Test;

/**
 * Example local unit test, which will execute on the development machine (host).
 *
 * @see <a href="http://d.android.com/tools/testing">Testing documentation</a>
 */
public class ExampleUnitTest {

    @Test
    public void betaNamespace_matchesApprovedIdentity() {
        assertEquals("org.scrolllibrary.beta", MainActivity.class.getPackage().getName());
    }
}
