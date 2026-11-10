package ai.ourcar.alive.logic

import ai.ourcar.alive.car.CarSnapshot
import ai.ourcar.alive.car.Warning
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.ZoneId
import kotlin.random.Random

class CharacterTest {
    private val base = CarSnapshot(connected = true, odometerKm = 1000.0, rangeKm = 300, energyPct = 60, isEv = true)

    @Test fun movingBeatsEverything() =
        assertEquals(Mood.EXCITED, computeStatus(base.copy(moving = true, warnings = setOf(Warning.ENGINE_OIL)), 0.0, 12).mood)

    @Test fun warningMakesSick() {
        val s = computeStatus(base.copy(warnings = setOf(Warning.BRAKE_FLUID)), 0.0, 12)
        assertEquals(Mood.SICK, s.mood)
        assertTrue(s.line.contains("브레이크액"))
    }

    @Test fun lowEnergyHungryWithRightWord() {
        assertTrue(computeStatus(base.copy(energyPct = 10), 0.0, 12).line.contains("충전"))
        assertTrue(computeStatus(base.copy(energyPct = 10, isEv = false), 0.0, 12).line.contains("주유"))
        assertEquals(Mood.HUNGRY, computeStatus(base.copy(energyPct = 10), 0.0, 12).mood)
    }

    @Test fun unknownEnergyIsNotHungry() =
        assertEquals(Mood.CALM, computeStatus(base.copy(energyPct = null), 0.0, 12).mood)

    @Test fun tiredSleepyHappyCalm() {
        assertEquals(Mood.TIRED, computeStatus(base, 200.0, 12).mood)
        assertEquals(Mood.SLEEPY, computeStatus(base, 0.0, 23).mood)
        assertEquals(Mood.SLEEPY, computeStatus(base, 0.0, 3).mood)
        assertEquals(Mood.HAPPY, computeStatus(base.copy(energyPct = 90), 0.0, 12).mood)
        assertEquals(Mood.CALM, computeStatus(base, 0.0, 12).mood)
    }
}

class TripTrackerTest {
    @Test fun parkDriveParkMakesTrip() {
        val t = TripTracker()
        assertNull(t.onUpdate(false, 100.0, 0))
        assertNull(t.onUpdate(true, 100.0, 0))
        assertNotNull(t.active)
        assertNull(t.onUpdate(true, 105.0, 5 * 60_000))
        val trip = t.onUpdate(false, 112.34, 20 * 60_000)!!
        assertEquals(12.3, trip.distanceKm, 0.001)
        assertEquals(20, trip.durationMin)
        assertEquals(37, trip.avgSpeedKmh)
        assertNull(t.active)
    }

    @Test fun tinyMoveIsIgnored() {
        val t = TripTracker()
        t.onUpdate(true, 100.0, 0)
        assertNull(t.onUpdate(false, 100.04, 30_000))
        assertNull(t.active)
    }

    @Test fun waitsForOdometer() {
        val t = TripTracker()
        assertNull(t.onUpdate(true, null, 0))
        assertNull(t.active)
    }

    @Test fun resumesFromSavedStart() {
        val t = TripTracker(TripTracker.Active(0, 50.0))
        assertEquals(10.0, t.onUpdate(false, 60.0, 30 * 60_000)!!.distanceKm, 0.001)
    }
}

class DiaryTest {
    private val zone = ZoneId.of("Asia/Seoul")
    private val trip = Trip(startedAt = 1_700_000_000_000, endedAt = 1_700_001_800_000, distanceKm = 12.0, durationMin = 30, avgSpeedKmh = 24)
    private val car = CarSnapshot(connected = true, energyPct = 50, rangeKm = 200)

    @Test fun normalDay() {
        val d = writeDiary("콩이", trip, car, emptySet(), zone, Random(1))
        assertEquals("평범하고 좋은 날", d.title)
        assertTrue(d.body.contains("12km"))
        assertTrue(d.body.endsWith("쉬는 중."))
        assertEquals(trip.endedAt, d.date)
    }

    @Test fun newWarningMakesSickDay() {
        val d = writeDiary("콩이", trip, car, setOf(Warning.WASHER_FLUID), zone, Random(1))
        assertEquals("조금 아팠던 날", d.title)
        assertTrue(d.body.contains("워셔액"))
    }

    @Test fun longTripAndHunger() {
        val d = writeDiary("콩이", trip.copy(distanceKm = 120.5, avgSpeedKmh = 80), car.copy(energyPct = 10, rangeKm = 40), emptySet(), zone, Random(1))
        assertEquals("먼 길 다녀온 날", d.title)
        assertTrue(d.body.contains("40km"))
    }
}
