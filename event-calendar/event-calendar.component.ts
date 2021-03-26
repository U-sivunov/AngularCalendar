import { AfterViewChecked, Component, OnDestroy, OnInit } from "@angular/core";
import * as Moment from "moment";
import * as _ from "lodash";
import { extendMoment } from "moment-range";
import { BehaviorSubject, Subject } from "rxjs";
import { take, takeUntil } from "rxjs/operators";
import { ApiService } from "../../../services/api.service";
import { CalendarEvent, CalendarEventItem } from "../../../models/data-models";

const moment = extendMoment(Moment);
moment.locale("ru");

export enum Tabs {
  MONTH = "Месяц",
  WEEK = "Неделя",
  DAY = "День",
}

@Component({
  selector: "app-event-calendar",
  templateUrl: "./event-calendar.component.html",
  styleUrls: ["./event-calendar.component.scss"],
})
export class EventCalendarComponent
  implements OnInit, OnDestroy, AfterViewChecked {
  destroy$ = new Subject();
  currentMonth$: BehaviorSubject<Moment.Moment> = new BehaviorSubject(
    moment().startOf("month")
  );
  currentMonth: Moment.Moment = moment().startOf("month");
  currentTab = Tabs.MONTH;
  daysOfWeek = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  events: CalendarEvent[];
  eventsItemsByDay: Map<string, CalendarEventItem[]> = new Map();
  selectedEvent: CalendarEvent;
  selectedItemId: number;
  expandedDay: string;
  expandedDayBodyElement: HTMLElement;

  eventFields = [
    { eventField: "name", title: "Тема" },
    { eventField: "event_type", title: "Вид события" },
    { eventField: "date_start", title: "Дата" },
    { eventField: "time_start", title: "Время" },
    { eventField: "duration", title: "Длительность" },
    { eventField: "venue", title: "Место" },
    { eventField: "organiser", title: "Организатор" },
    { eventField: "participants", title: "Участники" },
    { eventField: "cost", title: "Стоимость" },
  ];

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.currentMonth$.pipe(takeUntil(this.destroy$)).subscribe((newMonth) => {
      this.onMonthSet(newMonth);
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
  }

  ngAfterViewChecked(): void {
    this.moveAllItemsElement();
  }

  moveAllItemsElement() {
    if (this.expandedDayBodyElement) {
      const allItemsElement = this.expandedDayBodyElement
        .children[1] as HTMLElement;
      const itemsBottom =
        allItemsElement.offsetTop + allItemsElement.offsetHeight;
      const widget = document.getElementById("event-calendar-main");
      const widgetBottom = widget.offsetTop + widget.offsetHeight;
      let gap =
        itemsBottom - widgetBottom - this.expandedDayBodyElement.offsetHeight;
      gap = (100 * gap) / document.body.clientWidth + 2;
      if (gap > 0) {
        allItemsElement.style.setProperty("bottom", gap + "vw");
      }
      if (allItemsElement.scrollHeight > allItemsElement.clientHeight) {
        allItemsElement.style.setProperty("margin-right", "-1vw");
      }
    }
  }

  getTabs(): string[] {
    return Object.keys(Tabs);
  }

  getTabValue(tab: string) {
    return Tabs[tab];
  }

  changeTab(tab: string) {
    this.currentTab = Tabs[tab];
  }

  tabIsActive(tab: string): boolean {
    return this.currentTab === Tabs[tab];
  }

  getWeeks(): string[] {
    const weeks = [];
    const currentWeek = this.currentMonth
      .clone()
      .startOf("month")
      .startOf("week");
    const endOfMonth = this.currentMonth.clone().endOf("month");
    while (currentWeek.isBefore(endOfMonth)) {
      weeks.push(currentWeek.format("YYYY-MM-DD"));
      currentWeek.add(1, "weeks");
    }
    return weeks;
  }

  getDays(weekStr: string): string[] {
    const week = moment(weekStr);
    const days = [];
    const currentDay = week.clone().startOf("week");
    const endOfWeek = week.clone().endOf("week");
    while (currentDay.isBefore(endOfWeek)) {
      days.push(currentDay.format("YYYY-MM-DD"));
      currentDay.add(1, "day");
    }
    return days;
  }

  getDayTitle(dayStr: string) {
    const day = moment(dayStr);
    if (this.isDayInCurrentMonth(dayStr)) {
      return day.format("D");
    } else {
      return day.format("MMMM");
    }
  }

  isDayInCurrentMonth(dayStr: string) {
    const day = moment(dayStr);
    return (
      (day.isAfter(this.currentMonth) || day.isSame(this.currentMonth)) &&
      day.isBefore(this.currentMonth.clone().endOf("month"))
    );
  }

  isWeekend(dayStr: string): boolean {
    const day = moment(dayStr);
    return day.day() === 6 || day.day() === 0;
  }

  private onMonthSet(newMonth: Moment.Moment) {
    const dateAfter = newMonth.clone().startOf("month").format("YYYY-MM-DD");
    const dateBefore = newMonth.clone().endOf("month").format("YYYY-MM-DD");
    this.api
      .getCalendarEvents(dateAfter, dateBefore)
      .pipe(take(1))
      .subscribe((resp) => {
        this.events = resp.results;
        for (let i=0; i<2; i++) {
          resp.results.forEach((res, index) => {
            if (index % 5  === i) {
              for (let j=0; j< i+1 ; j++) {
                this.events.push(res);
              }
            }
          } )
        }
        this.parseEventsByDays();
      });
  }

  private parseEventsByDays() {
    this.eventsItemsByDay.clear();
    let currentDateString = "";
    let dayItems: CalendarEventItem[];
    let currentDate: Moment.Moment;
    let dateEnd: Moment.Moment;
    this.events.forEach((event) => {
      currentDate = moment(event.date_start);
      dateEnd = moment(event.date_end);
      while (currentDate.isBefore(dateEnd) || currentDate.isSame(dateEnd)) {
        currentDateString = currentDate.format("YYYY-MM-DD");

        if (this.eventsItemsByDay.has(currentDateString)) {
          dayItems = this.eventsItemsByDay.get(currentDateString);
        } else {
          dayItems = [];
          this.eventsItemsByDay.set(currentDateString, dayItems);
        }
        dayItems.push(new CalendarEventItem(event));
        currentDate.add(1, "day");
      }
    });
    this.sortItems();
  }

  private sortItems() {
    this.eventsItemsByDay.forEach((items, date) => {
      const sorted = _.sortBy(items, "timeStart");
      this.eventsItemsByDay.set(date, sorted);
    });
  }

  getDayItems(day: string): CalendarEventItem[] {
    const dayItems = this.eventsItemsByDay.get(day);
    if (dayItems) {
      if (dayItems.length > 2) {
        return dayItems.slice(0, 2);
      } else {
        return dayItems;
      }
    } else {
      return [];
    }
  }

  getExtraItems(day: string): CalendarEventItem[] {
    const dayItems = this.eventsItemsByDay.get(day);
    if (dayItems) {
      if (dayItems.length > 2) {
        return dayItems.slice(2);
      } else {
        return [];
      }
    } else {
      return [];
    }
  }

  getExtraString(length: number) {
    let events = "";
    switch (length) {
      case 1:
        events = "событие";
        break;
      case 2:
      case 3:
      case 4:
        events = "события";
        break;
      default:
        events = "событий";
    }
    return `Ещё ${length} ${events}`;
  }

  getTimeString(item: CalendarEventItem | CalendarEvent) {
    let start: Moment.Moment;
    let end: Moment.Moment;
    if (item instanceof CalendarEventItem) {
      start = item.event.time_start
        ? moment("2020-01-01 " + item.event.time_start)
        : undefined;
      end = item.event.time_end
        ? moment("2020-01-01 " + item.event.time_end)
        : undefined;
    } else {
      start = item.time_start
        ? moment("2020-01-01 " + item.time_start)
        : undefined;
      end = item.time_end ? moment("2020-01-01 " + item.time_end) : undefined;
    }
    let timeString = "";
    if (start) {
      timeString += start.format("H:mm");
    }
    if (!start && end) {
      timeString += "...";
    }
    if (end) {
      timeString += " - " + end.format("H:mm");
    }
    return timeString;
  }

  onItemClick(item: CalendarEventItem) {
    this.selectedEvent = item.event;
    this.selectedItemId = item.id;
  }

  showExtraItems(event: MouseEvent, day: string) {
    this.expandedDay = day;
    const target: HTMLElement = event.target as HTMLElement;
    this.expandedDayBodyElement = target.parentElement.parentElement;
  }

  getAllDayItems(day: string) {
    const dayItems = this.eventsItemsByDay.get(day);
    if (dayItems) {
      return dayItems;
    } else {
      return [];
    }
  }

  closeInfoBar() {
    this.selectedEvent = null;
    this.selectedItemId = null;
  }

  getEventDatePeriod() {
    const start = moment(this.selectedEvent.date_start);
    const end = moment(this.selectedEvent.date_end);
    let period = "";
    if (start.clone().startOf("month").isSame(end.clone().startOf("month"))) {
      if (start.clone().startOf("day").isSame(end.clone().startOf("day"))) {
        period = start.format("D MMMM");
      } else {
        period = `${start.format("D")}-${end.format("D MMMM")}`;
      }
    } else {
      period = `${start.format("D MMMM")} - ${end.format("D MMMM")}`;
    }
    return period;
  }
}
