import { SymbolView } from 'expo-symbols';
import React, { useState } from 'react';
import {
  FlatList,
  ImageBackground,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const COLORS = {
  bg: '#16181D',
  surface: '#22252C',
  pink: '#F0508A',
  text: '#FFFFFF',
  muted: '#9AA0AA',
  icon: '#C9CDD4',
} as const;

type EventItem = {
  id: string;
  tag: string;
  title: string;
  time: string;
  image: string;
  saved: boolean;
};

const EVENTS: EventItem[] = [
  {
    id: '1',
    tag: 'Music',
    title: 'Concert',
    time: '9:00pm est',
    image:
      'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800',
    saved: false,
  },
  {
    id: '2',
    tag: 'Food',
    title: 'Food Truck',
    time: '4:00pm est',
    image:
      'https://images.unsplash.com/photo-1565123409695-7b5ef63a2efb?w=800',
    saved: true,
  },
];

function Header(): React.JSX.Element {
  return (
    <View style={styles.header}>
      <TouchableOpacity>
        <SymbolView
          name={{ ios: 'line.3.horizontal.decrease', android: 'filter_list', web: 'filter_list' }}
          size={26}
          tintColor={COLORS.icon}
        />
      </TouchableOpacity>

      <View style={styles.searchBox}>
        <TextInput
          placeholder="search"
          placeholderTextColor={COLORS.muted}
          style={styles.searchInput}
        />
        <SymbolView
          name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
          size={16}
          tintColor={COLORS.muted}
        />
      </View>

      <TouchableOpacity>
        <SymbolView
          name={{ ios: 'person.crop.circle', android: 'account_circle', web: 'account_circle' }}
          size={30}
          tintColor={COLORS.icon}
        />
      </TouchableOpacity>
    </View>
  );
}

type EventCardProps = {
  item: EventItem;
  onToggleSave: (id: string) => void;
};

function EventCard({ item, onToggleSave }: EventCardProps): React.JSX.Element {
  return (
    <ImageBackground
      source={{ uri: item.image }}
      style={styles.card}
      imageStyle={styles.cardImage}
    >
      <View style={styles.overlay} />

      <View style={styles.tag}>
        <Text style={styles.tagText}>{item.tag}</Text>
      </View>

      <View style={styles.cardBottom}>
        <View>
          <Text style={styles.cardTitle}>{item.title}</Text>
          <Text style={styles.cardTime}>{item.time}</Text>
        </View>
        <TouchableOpacity onPress={() => onToggleSave(item.id)}>
          <SymbolView
            name={
              item.saved
                ? { ios: 'bookmark.fill', android: 'bookmark', web: 'bookmark' }
                : { ios: 'bookmark', android: 'bookmark_border', web: 'bookmark_border' }
            }
            size={24}
            tintColor={item.saved ? COLORS.pink : COLORS.text}
          />
        </TouchableOpacity>
      </View>
    </ImageBackground>
  );
}

function TabBar(): React.JSX.Element {
  return (
    <View style={styles.tabBar}>
      <TouchableOpacity>
        <SymbolView
          name={{ ios: 'plus.circle', android: 'add_circle', web: 'add_circle' }}
          size={30}
          tintColor={COLORS.icon}
        />
      </TouchableOpacity>
      <TouchableOpacity>
        <SymbolView
          name={{ ios: 'house', android: 'home', web: 'home' }}
          size={30}
          tintColor={COLORS.pink}
        />
      </TouchableOpacity>
      <TouchableOpacity>
        <SymbolView
          name={{ ios: 'bookmark.fill', android: 'bookmark', web: 'bookmark' }}
          size={26}
          tintColor={COLORS.icon}
        />
      </TouchableOpacity>
    </View>
  );
}

export default function HomeScreen(): React.JSX.Element {
  const [events, setEvents] = useState<EventItem[]>(EVENTS);

  const toggleSave = (id: string): void =>
    setEvents((prev) =>
      prev.map((e) => (e.id === id ? { ...e, saved: !e.saved } : e))
    );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" />
      <Header />
      <FlatList<EventItem>
        data={events}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <EventCard item={item} onToggleSave={toggleSave} />
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
      <SafeAreaView edges={['bottom']} style={styles.tabBarWrap}>
        <TabBar />
      </SafeAreaView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    paddingHorizontal: 14,
    height: 36,
  },
  searchInput: {
    flex: 1,
    color: COLORS.text,
    fontSize: 14,
  },
  list: {
    padding: 16,
    gap: 16,
  },
  card: {
    height: 180,
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#3A3E47',
    overflow: 'hidden',
  },
  cardImage: {
    borderRadius: 16,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  tag: {
    alignSelf: 'flex-start',
    borderWidth: 1.5,
    borderColor: COLORS.pink,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 2,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  tagText: {
    color: COLORS.pink,
    fontSize: 12,
    fontWeight: '600',
  },
  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  cardTitle: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: '800',
  },
  cardTime: {
    color: COLORS.text,
    fontSize: 13,
    opacity: 0.9,
  },
  tabBarWrap: {
    backgroundColor: COLORS.surface,
  },
  tabBar: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    height: 64,
  },
});
